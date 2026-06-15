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
    banners: [
      '/static/pet/poster1.jpg',
      '/static/pet/poster2.jpg',
      '/static/pet/poster3.jpg',
    ],
  },

  /** 搜索建议防抖定时器 */
  _searchTimer: null,

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

  // 搜索输入变化（带防抖）
  onSearchChange(e) {
    const keyword = e.detail.value !== undefined ? e.detail.value : e.detail;
    this.setData({ searchKeyword: keyword });

    // 清除上一个防抖定时器
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }

    // 如果有关键词，延迟 300ms 后查询搜索建议
    if (keyword.trim()) {
      this._searchTimer = setTimeout(() => {
        this.getSearchSuggestions(keyword.trim());
      }, 300);
    } else {
      this.setData({ showSuggestions: false, searchSuggestions: [] });
    }
  },

  // 从数据库获取搜索建议（机构 + 服务）
  async getSearchSuggestions(keyword) {
    const db = wx.cloud.database();
    const suggestions = [];

    try {
      // 并行搜索机构和服务
      const [agencyRes, svcRes] = await Promise.all([
        db.collection('agency_profiles')
          .where({
            auditStatus: 'approved',
            orgName: db.RegExp({ regexp: keyword, options: 'i' })
          })
          .field({ _id: true, orgName: true, detailAddress: true, region: true })
          .limit(3)
          .get(),
        db.collection('agency_services')
          .where({
            name: db.RegExp({ regexp: keyword, options: 'i' })
          })
          .field({ _id: true, name: true, category: true, agencyProfileId: true })
          .limit(3)
          .get(),
      ]);

      // 添加机构建议
      (agencyRes.data || []).forEach(item => {
        suggestions.push({
          _id: item._id,
          name: item.orgName,
          subtitle: item.detailAddress || item.region || '',
          type: 'agency',
          typeLabel: '机构',
        });
      });

      // 添加服务建议
      (svcRes.data || []).forEach(item => {
        suggestions.push({
          _id: item._id,
          name: item.name,
          subtitle: CAT_TITLE_MAP[item.category] || '服务',
          type: 'service',
          typeLabel: '服务',
        });
      });

      // 只有当前输入关键词与查询一致时才更新（防止异步竞态）
      if (this.data.searchKeyword.trim() === keyword) {
        this.setData({
          searchSuggestions: suggestions,
          showSuggestions: suggestions.length > 0,
        });
      }
    } catch (e) {
      console.warn('搜索建议查询失败', e);
    }
  },

  // 执行搜索（键盘确认 / 点击搜索按钮）
  onSearch() {
    const { searchKeyword } = this.data;
    this.setData({ showSuggestions: false });
    if (searchKeyword.trim()) {
      wx.navigateTo({
        url: `/pages/browse-agencies/browse-agencies?keyword=${searchKeyword.trim()}`
      });
    }
  },

  // 跳转到搜索页
  goToSearch() {
    const { searchKeyword } = this.data;
    this.setData({ showSuggestions: false });
    if (searchKeyword.trim()) {
      wx.navigateTo({
        url: `/pages/browse-agencies/browse-agencies?keyword=${searchKeyword.trim()}`
      });
    } else {
      wx.navigateTo({
        url: '/pages/browse-agencies/browse-agencies'
      });
    }
  },

  // 搜索框获得焦点
  onSearchFocus() {
    // 如果已有输入内容，重新显示建议
    const { searchKeyword } = this.data;
    if (searchKeyword.trim() && this.data.searchSuggestions.length > 0) {
      this.setData({ showSuggestions: true });
    }
  },

  // 清空搜索
  onSearchClear() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.setData({
      searchKeyword: '',
      searchSuggestions: [],
      showSuggestions: false
    });
  },

  // 点击搜索建议
  onSuggestionTap(e) {
    const { id, type } = e.currentTarget.dataset;
    this.setData({ showSuggestions: false });

    if (type === 'service') {
      wx.navigateTo({
        url: `/pages/service-detail/service-detail?id=${id}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/agency-detail/agency-detail?id=${id}`
      });
    }
  },

  // 点击建议区域外部关闭建议
  onSuggestionMaskTap() {
    this.setData({ showSuggestions: false });
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

  toPet() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  toHealth() {
    wx.navigateTo({ url: '/pages/health/health' });
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
