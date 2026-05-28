// pages/admin/audit.js
const authService = require('../../services/authService');

Page({
  data: {
    activeTab: 0,
    pendingList: [],
    historyList: [],
    loading: true,
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
    this.loadPendingList();
    this.loadHistoryList();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.index });
  },

  async loadPendingList() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const userRes = await db.collection('users')
        .where({ role: 'agency', auditStatus: _.in(['pending', 'rejected']) })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const users = userRes.data || [];
      if (!users.length) {
        this.setData({ pendingList: [], loading: false });
        return;
      }
      const profileIds = users.map((u) => u.agencyProfileId).filter(Boolean);
      let profileMap = {};
      if (profileIds.length) {
        const profileRes = await db.collection('agency_profiles').where({ _id: _.in(profileIds) }).get();
        profileMap = (profileRes.data || []).reduce((m, p) => { m[p._id] = p; return m; }, {});
      }
      const pendingList = users.map((u) => ({
        userId: u._id,
        account: u.account || '',
        auditStatus: u.auditStatus || 'pending',
        profile: profileMap[u.agencyProfileId] || {},
      }));
      this.setData({ pendingList, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadHistoryList() {
    try {
      const db = wx.cloud.database();
      const userRes = await db.collection('users')
        .where({ role: 'agency' })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const users = userRes.data || [];
      if (!users.length) {
        this.setData({ historyList: [] });
        return;
      }
      const profileIds = users.map((u) => u.agencyProfileId).filter(Boolean);
      const _ = db.command;
      let profileMap = {};
      if (profileIds.length) {
        const profileRes = await db.collection('agency_profiles').where({ _id: _.in(profileIds) }).get();
        profileMap = (profileRes.data || []).reduce((m, p) => { m[p._id] = p; return m; }, {});
      }
      const historyList = users.map((u) => ({
        userId: u._id,
        account: u.account || '',
        auditStatus: u.auditStatus || 'pending',
        createTime: u.createTime,
        profile: profileMap[u.agencyProfileId] || {},
      }));
      this.setData({ historyList });
    } catch (err) { /* ignore */ }
  },

  async approve(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    await this.updateAudit(userId, profileId, 'approved');
  },

  async reject(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    await this.updateAudit(userId, profileId, 'rejected');
  },

  async updateAudit(userId, profileId, status) {
    try {
      const db = wx.cloud.database();
      await db.collection('users').doc(userId).update({ data: { auditStatus: status } });
      if (profileId) {
        await db.collection('agency_profiles').doc(profileId).update({
          data: { auditStatus: status, updateTime: db.serverDate() },
        });
      }
      wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回', icon: 'success' });
      this.loadPendingList();
      this.loadHistoryList();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  deleteAgency(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后该机构账号和资料将被永久清除，确定删除吗？',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'delete_agency', userId, profileId },
          });
          wx.hideLoading();
          if (result.result && result.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadPendingList();
            this.loadHistoryList();
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
