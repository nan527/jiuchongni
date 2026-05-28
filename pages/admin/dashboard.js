// pages/admin/dashboard.js
const authService = require('../../services/authService');

Page({
  data: {
    loading: true,
    totalAgencies: 0,
    approvedAgencies: 0,
    pendingAgencies: 0,
    rejectedAgencies: 0,
    totalUsers: 0,
    totalOrders: 0,
    totalServices: 0,
    typeDistribution: [],
    recentAgencies: [],
    cleaning: false,
  },

  onShow() {
    this.onShowImpl();
  },

  async onShowImpl() {
    const userInfo = await authService.checkLogin();
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      // 并行查询所有数据
      const [agencyTotal, agencyApproved, agencyPending, agencyRejected, userTotal, orderTotal, serviceTotal] = await Promise.all([
        db.collection('users').where({ role: 'agency' }).count().catch(() => ({ total: 0 })),
        db.collection('users').where({ role: 'agency', auditStatus: 'approved' }).count().catch(() => ({ total: 0 })),
        db.collection('users').where({ role: 'agency', auditStatus: 'pending' }).count().catch(() => ({ total: 0 })),
        db.collection('users').where({ role: 'agency', auditStatus: 'rejected' }).count().catch(() => ({ total: 0 })),
        db.collection('users').where({ role: 'pet_owner' }).count().catch(() => ({ total: 0 })),
        db.collection('user_orders').count().catch(() => ({ total: 0 })),
        db.collection('agency_services').count().catch(() => ({ total: 0 })),
      ]);

      // 机构类型分布
      const TYPE_LIST = ['宠物寄养机构', '宠物医院', '宠物美容洗护', '宠物用品店', '综合服务'];
      const typeCounts = await Promise.all(
        TYPE_LIST.map((t) =>
          db.collection('agency_profiles').where({ auditStatus: 'approved', businessType: t }).count().catch(() => ({ total: 0 }))
        )
      );
      const typeDistribution = TYPE_LIST.map((label, i) => ({
        label,
        count: typeCounts[i].total || 0,
      }));
      const maxTypeCount = Math.max(...typeDistribution.map((d) => d.count), 1);
      typeDistribution.forEach((d) => { d.percent = Math.round((d.count / maxTypeCount) * 100); });

      // 最近入驻机构
      let recentAgencies = [];
      try {
        const recentRes = await db.collection('agency_profiles')
          .where({ auditStatus: 'approved' })
          .orderBy('createTime', 'desc')
          .limit(5)
          .get();
        recentAgencies = recentRes.data || [];
      } catch (e) { /* ignore */ }

      this.setData({
        loading: false,
        totalAgencies: agencyTotal.total || 0,
        approvedAgencies: agencyApproved.total || 0,
        pendingAgencies: agencyPending.total || 0,
        rejectedAgencies: agencyRejected.total || 0,
        totalUsers: userTotal.total || 0,
        totalOrders: orderTotal.total || 0,
        totalServices: serviceTotal.total || 0,
        typeDistribution,
        recentAgencies,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  cleanupData() {
    wx.showModal({
      title: '清理冗余数据',
      content: '将删除所有孤立的机构资料（无对应账号）和无效机构账号（无对应资料），确定继续？',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ cleaning: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'cleanup_orphaned_agencies' },
          });
          this.setData({ cleaning: false });
          const r = result.result || {};
          if (r.success) {
            wx.showModal({
              title: '清理完成',
              content: `已删除 ${r.deletedProfiles || 0} 个孤立机构资料，${r.deletedUsers || 0} 个无效账号`,
              showCancel: false,
            });
            this.loadDashboard();
          } else {
            wx.showToast({ title: '清理失败', icon: 'none' });
          }
        } catch (err) {
          this.setData({ cleaning: false });
          wx.showToast({ title: '清理失败', icon: 'none' });
        }
      },
    });
  },
});
