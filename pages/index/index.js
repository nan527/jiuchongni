// pages/index/index.js
const { CAT_TITLE_MAP } = require('../../utils/helpers');
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');

Page({
  data: {
    agencyList: [],
    agencyLoading: true,
    svcList: [],
    svcLoading: true,
    searchKeyword: '',
    searchSuggestions: [],
    showSuggestions: false,
  },

  onShow() {
    // 页面显示时重置搜索状态，避免返回时出现重复搜索栏
    this.setData({
      showSuggestions: false,
      searchKeyword: ''
    });
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

  // 搜索输入变化
  onSearchChange(e) {
    const keyword = e.detail
    this.setData({ searchKeyword: keyword })

    // 如果有关键词，显示搜索建议
    if (keyword.trim()) {
      this.getSearchSuggestions(keyword)
    } else {
      this.setData({ showSuggestions: false })
    }
  },

  // 获取搜索建议
  getSearchSuggestions(keyword) {
    // 从机构列表中筛选匹配的建议
    const suggestions = (this.data.agencyList || []).filter(agency =>
      agency.orgName.includes(keyword) ||
      (agency.address && agency.address.includes(keyword))
    ).slice(0, 5)

    this.setData({
      searchSuggestions: suggestions,
      showSuggestions: suggestions.length > 0
    })
  },

  // 执行搜索
  onSearch() {
    const { searchKeyword } = this.data
    if (searchKeyword.trim()) {
      wx.navigateTo({
        url: `/pages/browse-agencies/browse-agencies?keyword=${searchKeyword}`
      })
    }
  },

  // 跳转到搜索页
  goToSearch() {
    const { searchKeyword } = this.data
    if (searchKeyword.trim()) {
      wx.navigateTo({
        url: `/pages/browse-agencies/browse-agencies?keyword=${searchKeyword}`
      })
    } else {
      wx.navigateTo({
        url: '/pages/browse-agencies/browse-agencies'
      })
    }
  },

  // 搜索框获得焦点
  onSearchFocus() {
    // 可选：显示搜索历史或热门搜索
  },

  // 清空搜索
  onSearchClear() {
    this.setData({
      searchKeyword: '',
      showSuggestions: false
    })
  },

  // 点击搜索建议
  onSuggestionTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/agency-detail/agency-detail?id=${id}`
    })
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
