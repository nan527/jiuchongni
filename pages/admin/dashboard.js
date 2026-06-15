// pages/admin/dashboard.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    loading: true,
    activeTab: 0,
    tabList: [
      { key: 'overview', label: '总览' },
      { key: 'audit', label: '审核状态' },
      { key: 'type', label: '类型分布' },
      { key: 'revenue', label: '收入统计' },
    ],
    headerHeight: 0,
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
    statusBarHeight: 0,
    navBarHeight: 0,
    // 收入统计
    revenueLoading: false,
    totalRevenue: 0,
    avgOrderPrice: 0,
    completedOrders: 0,
    orderStatusList: [],
    orderCategoryList: [],
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    // 导航栏 88rpx + 自定义 tab 约 80rpx + 底部弧 40rpx
    const headerHeight = navBarHeight + 80 + 40;
    this.setData({ statusBarHeight, navBarHeight, headerHeight });
  },

  onGoBack() {
    wx.navigateBack();
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

  onTabChange(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ activeTab: idx });
    if (idx === 3 && !this.data.revenueLoading && this.data.totalRevenue === 0) {
      this.loadRevenueData();
    }
  },

  async loadDashboard() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      const [agencyTotal, agencyApproved, agencyPending, agencyRejected, userTotal, orderTotal, serviceTotal] = await Promise.all([
        db.collection('agency_profiles').count().catch(() => ({ total: 0 })),
        db.collection('agency_profiles').where({ auditStatus: 'approved' }).count().catch(() => ({ total: 0 })),
        db.collection('agency_profiles').where({ auditStatus: 'pending' }).count().catch(() => ({ total: 0 })),
        db.collection('agency_profiles').where({ auditStatus: 'rejected' }).count().catch(() => ({ total: 0 })),
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

  // 懒加载收入统计数据
  async loadRevenueData() {
    this.setData({ revenueLoading: true });
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      // 分批获取所有订单以聚合金额（云数据库每次最多100条）
      let allOrders = [];
      let hasMore = true;
      let lastId = null;
      while (hasMore) {
        let query = db.collection('user_orders').orderBy('_id', 'asc').limit(100);
        if (lastId) query = query.where({ _id: _.gt(lastId) });
        const res = await query.get();
        const orders = res.data || [];
        allOrders = allOrders.concat(orders);
        if (orders.length > 0) lastId = orders[orders.length - 1]._id;
        if (orders.length < 100) hasMore = false;
      }

      // 统计收入
      const completedOrders = allOrders.filter((o) => o.orderStatus === 'completed');
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.price || 0), 0);
      const avgOrderPrice = completedOrders.length > 0 ? Math.round(totalRevenue / completedOrders.length) : 0;

      // 订单状态分布
      const STATUS_MAP = {
        unpaid: '待付款',
        pending: '待确认',
        confirmed: '已确认',
        in_progress: '进行中',
        to_confirm: '待确认完成',
        to_review: '待评价',
        completed: '已完成',
        cancelled: '已取消',
      };
      const statusCounts = {};
      allOrders.forEach((o) => {
        const s = o.orderStatus || 'unknown';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      const orderStatusList = Object.keys(STATUS_MAP).map((key) => ({
        key,
        label: STATUS_MAP[key],
        count: statusCounts[key] || 0,
      })).filter((item) => item.count > 0);
      const maxStatusCount = Math.max(...orderStatusList.map((d) => d.count), 1);
      orderStatusList.forEach((d) => { d.percent = Math.round((d.count / maxStatusCount) * 100); });

      // 订单分类分布
      const CATEGORY_MAP = {
        foster: '寄养',
        grooming: '美容洗护',
        medical: '医疗健康',
        door: '上门服务',
        extra: '商品增值',
      };
      const catCounts = {};
      allOrders.forEach((o) => {
        const c = o.category || 'other';
        catCounts[c] = (catCounts[c] || 0) + 1;
      });
      const orderCategoryList = Object.keys(CATEGORY_MAP).map((key) => ({
        key,
        label: CATEGORY_MAP[key],
        count: catCounts[key] || 0,
      })).filter((item) => item.count > 0);
      const maxCatCount = Math.max(...orderCategoryList.map((d) => d.count), 1);
      orderCategoryList.forEach((d) => { d.percent = Math.round((d.count / maxCatCount) * 100); });

      this.setData({
        revenueLoading: false,
        totalRevenue,
        avgOrderPrice,
        completedOrders: completedOrders.length,
        orderStatusList,
        orderCategoryList,
      });
    } catch (err) {
      console.error('[Dashboard] loadRevenueData', err);
      this.setData({ revenueLoading: false });
      wx.showToast({ title: '收入数据加载失败', icon: 'none' });
    }
  },

  goAudit() {
    wx.navigateTo({ url: '/pages/admin/audit' });
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
