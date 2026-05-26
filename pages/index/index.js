// pages/index/index.js
const CAT_TITLE_MAP = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

Page({
  data: {
    agencyList: [],
    agencyLoading: true,
    svcList: [],
    svcLoading: true,
  },

  onShow() {
    this.loadAgencies();
    this.loadServices();
  },

  async loadAgencies() {
    this.setData({ agencyLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles')
        .where({ auditStatus: 'approved' })
        .orderBy('createTime', 'desc')
        .limit(4)
        .get();
      this.setData({ agencyList: res.data || [], agencyLoading: false });
    } catch (e) {
      this.setData({ agencyList: [], agencyLoading: false });
    }
  },

  async loadServices() {
    this.setData({ svcLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .orderBy('createTime', 'desc')
        .limit(4)
        .get();
      const svcList = (res.data || []).map(s => ({
        ...s,
        catTitle: CAT_TITLE_MAP[s.category] || '服务',
      }));
      this.setData({ svcList, svcLoading: false });
    } catch (e) {
      this.setData({ svcList: [], svcLoading: false });
    }
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/browse-agencies/browse-agencies' });
  },

  // 功能入口
  toBrowseAgencies() {
    wx.navigateTo({ url: '/pages/browse-agencies/browse-agencies' });
  },

  toAI() {
    wx.showToast({ title: 'AI 创作即将上线', icon: 'none' });
  },

  toHealth() {
    wx.showToast({ title: '健康管理即将上线', icon: 'none' });
  },

  onAgencyTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  onSvcTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onPullDownRefresh() {
    this.loadAgencies();
    this.loadServices();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {},
});
