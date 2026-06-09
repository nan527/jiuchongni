// pages/agency-detail/agency-detail.js
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');
const { CAT_TITLE_MAP, getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    agency: null,
    svcList: [],
    loading: true,
    svcLoading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onGoBack() {
    wx.navigateBack();
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const { id } = options;
    if (id) {
      this.loadAgency(id);
    }
  },

  async loadAgency(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles').doc(id).get();
      const agencies = await resolveAgencyImages([res.data]);
      const agency = agencies[0];
      this.setData({ agency, loading: false });
      // 用机构 profileId 加载其服务
      this.loadServices(id);
    } catch (e) {
      this.setData({ agency: null, loading: false, svcLoading: false });
      wx.showToast({ title: '机构信息加载失败', icon: 'none' });
    }
  },

  async loadServices(profileId) {
    this.setData({ svcLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .where({ agencyProfileId: profileId })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();
      const svcList = [];
      for (const s of (res.data || [])) {
        const item = { ...s, catTitle: CAT_TITLE_MAP[s.category] || '服务' };
        if (Array.isArray(item.images) && item.images.length) {
          item.images = await resolveTempUrls(item.images);
        }
        svcList.push(item);
      }
      this.setData({ svcList, svcLoading: false });
    } catch (e) {
      this.setData({ svcList: [], svcLoading: false });
    }
  },

  onSvcTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onPreviewImage(e) {
    const { url, list } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: list || [url] });
  },

  onShareAppMessage() {
    const { agency } = this.data;
    return {
      title: agency ? agency.orgName : '就宠你',
      path: `/pages/agency-detail/agency-detail?id=${agency?._id}`,
    };
  },
});
