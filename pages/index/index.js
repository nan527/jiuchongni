// pages/index/index.js
const { CAT_TITLE_MAP } = require('../../utils/helpers');
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');

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
      const list = await resolveAgencyImages(res.data || []);
      this.setData({ agencyList: list, agencyLoading: false });
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
      const svcList = [];
      for (const s of (res.data || [])) {
        const item = { ...s, catTitle: CAT_TITLE_MAP[s.category] || '服务' };
        if (Array.isArray(item.images) && item.images.length) {
          item.images = await resolveTempUrls(item.images);
        }
        // 加载机构名称
        if (s.agencyProfileId) {
          try {
            const agencyRes = await db.collection('agency_profiles').doc(s.agencyProfileId).field({ orgName: true }).get();
            item.agencyName = agencyRes.data.orgName || '';
          } catch (e) {
            item.agencyName = '';
          }
        }
        svcList.push(item);
      }
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

  toBrowseServices() {
    wx.navigateTo({ url: '/pages/browse-services/browse-services' });
  },

  toAI() {
    wx.navigateTo({ url: '/pages/ai/ai' });
  },

  toHealth() {
    wx.showToast({ title: '健康管理即将上线', icon: 'none' });
  },

  toSmartMatch() {
    wx.navigateTo({ url: '/pages/smart-match/smart-match' });
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
