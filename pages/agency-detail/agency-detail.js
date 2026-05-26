// pages/agency-detail/agency-detail.js
const CAT_TITLE_MAP = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

Page({
  data: {
    agency: null,
    svcList: [],
    loading: true,
    svcLoading: true,
  },

  onLoad(options) {
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
      const agency = res.data;
      this.setData({ agency, loading: false });
      // 用机构的 _openid 加载其服务
      if (agency._openid) {
        this.loadServices(agency._openid);
      } else {
        this.setData({ svcLoading: false });
      }
    } catch (e) {
      this.setData({ agency: null, loading: false, svcLoading: false });
      wx.showToast({ title: '机构信息加载失败', icon: 'none' });
    }
  },

  async loadServices(openid) {
    this.setData({ svcLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(20)
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
