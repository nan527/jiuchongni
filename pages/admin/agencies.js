// pages/admin/agencies.js
const authService = require('../../services/authService');

Page({
  data: {
    loading: true,
    agencyList: [],
    searchVal: '',
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
    this.loadAgencies();
  },

  async loadAgencies() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles')
        .where({ auditStatus: 'approved' })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      this.setData({ agencyList: res.data || [], loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
  },

  onSearchChange(e) {
    this.setData({ searchVal: e.detail });
  },

  onSearch() {
    const keyword = this.data.searchVal.trim();
    if (!keyword) {
      this.loadAgencies();
      return;
    }
    this.searchAgencies(keyword);
  },

  onSearchClear() {
    this.setData({ searchVal: '' });
    this.loadAgencies();
  },

  async searchAgencies(keyword) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    try {
      const whereCondition = _.and([
        { auditStatus: 'approved' },
        _.or([
          { orgName: db.RegExp({ regexp: keyword, options: 'i' }) },
          { region: db.RegExp({ regexp: keyword, options: 'i' }) },
          { detailAddress: db.RegExp({ regexp: keyword, options: 'i' }) },
        ]),
      ]);
      const res = await db.collection('agency_profiles')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      this.setData({ agencyList: res.data || [], loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  deleteAgency(e) {
    const { profileId } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后该机构将被永久清除，确定吗？',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'delete_agency', profileId },
          });
          wx.hideLoading();
          if (result.result && result.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadAgencies();
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
