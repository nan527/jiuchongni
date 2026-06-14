// pages/browse-agencies/browse-agencies.js
const { resolveAgencyImages } = require('../../utils/fileHelper');
const { getStatusBarHeight } = require('../../utils/helpers');
const TYPE_LIST = [
  { key: 'all', label: '全部' },
  { key: '宠物寄养机构', label: '寄养机构' },
  { key: '宠物医院', label: '宠物医院' },
  { key: '宠物美容洗护', label: '美容洗护' },
  { key: '宠物用品店', label: '用品店' },
  { key: '综合服务', label: '综合服务' },
];

Page({
  data: {
    typeList: TYPE_LIST,
    activeType: 'all',
    agencyList: [],
    loading: true,
    searchVal: '',
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadAgencies();

    // 如果有keyword参数，执行搜索
    if (options.keyword) {
      this.setData({ searchVal: options.keyword });
      this.searchAgencies(options.keyword);
    }
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadAgencies(businessType) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    let query = { auditStatus: 'approved' };

    if (businessType && businessType !== 'all') {
      query.businessType = businessType;
    }

    try {
      const res = await db.collection('agency_profiles')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      const list = await resolveAgencyImages(res.data || []);
      this.setData({ agencyList: list, loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeType: key });
    this.loadAgencies(key);
  },

  onSearchChange(e) {
    this.setData({ searchVal: e.detail });
  },

  onSearch() {
    const { searchVal, activeType } = this.data;
    if (!searchVal.trim()) {
      this.loadAgencies(activeType);
      return;
    }
    this.searchAgencies(searchVal.trim(), activeType);
  },

  async searchAgencies(keyword, businessType) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    try {
      let whereCondition = _.and([
        { auditStatus: 'approved' },
        _.or([
          { orgName: db.RegExp({ regexp: keyword, options: 'i' }) },
          { detailAddress: db.RegExp({ regexp: keyword, options: 'i' }) },
          { region: db.RegExp({ regexp: keyword, options: 'i' }) },
          { orgIntro: db.RegExp({ regexp: keyword, options: 'i' }) },
        ]),
      ]);

      if (businessType && businessType !== 'all') {
        whereCondition = _.and([whereCondition, { businessType }]);
      }

      const res = await db.collection('agency_profiles')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      const list = await resolveAgencyImages(res.data || []);
      this.setData({ agencyList: list, loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
  },

  onAgencyTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  onPullDownRefresh() {
    this.loadAgencies(this.data.activeType);
    wx.stopPullDownRefresh();
  },
});
