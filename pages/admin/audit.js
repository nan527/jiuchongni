// pages/admin/audit.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    activeTab: 0,
    pendingList: [],
    historyList: [],
    loading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
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
    this.loadPendingList();
    this.loadHistoryList();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.index });
  },

  goDetail(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/audit-detail?userId=${userId}&profileId=${profileId}`,
    });
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
      // 解析图片 cloud:// ID 为临时 URL
      const pendingList = users.map((u) => ({
        userId: u._id,
        account: u.account || '',
        auditStatus: u.auditStatus || 'pending',
        profile: profileMap[u.agencyProfileId] || {},
      }));
      // 收集所有需要解析的图片 ID
      const fileIDs = [];
      pendingList.forEach((item) => {
        const p = item.profile;
        if (p.licenseImage && p.licenseImage.startsWith('cloud://')) fileIDs.push(p.licenseImage);
        if (p.storefrontImage && p.storefrontImage.startsWith('cloud://')) fileIDs.push(p.storefrontImage);
        if (p.permitImage && p.permitImage.startsWith('cloud://')) fileIDs.push(p.permitImage);
      });
      if (fileIDs.length) {
        try {
          const urlRes = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'get_file_urls', fileIDs },
          });
          const urls = (urlRes.result && urlRes.result.urls) || [];
          const urlMap = {};
          fileIDs.forEach((id, i) => { urlMap[id] = urls[i] || id; });
          pendingList.forEach((item) => {
            const p = item.profile;
            if (p.licenseImage && urlMap[p.licenseImage]) p.licenseImage = urlMap[p.licenseImage];
            if (p.storefrontImage && urlMap[p.storefrontImage]) p.storefrontImage = urlMap[p.storefrontImage];
            if (p.permitImage && urlMap[p.permitImage]) p.permitImage = urlMap[p.permitImage];
          });
        } catch (e) { /* 图片解析失败不影响列表显示 */ }
      }
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
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'update_agency_audit', userId, profileId, status },
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回', icon: 'success' });
        this.loadPendingList();
        this.loadHistoryList();
      } else {
        wx.showToast({ title: '操作失败: ' + (res.result.msg || '未知错误'), icon: 'none' });
      }
    } catch (err) {
      console.error('[Audit] updateAudit error', err);
      wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
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
