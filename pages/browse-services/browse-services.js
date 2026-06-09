// pages/browse-services/browse-services.js
const { resolveTempUrls } = require('../../utils/fileHelper');
const { getStatusBarHeight } = require('../../utils/helpers');

const CATEGORY_LIST = [
  { key: 'all', label: '全部' },
  { key: 'foster', label: '宠物寄养' },
  { key: 'grooming', label: '美容洗护' },
  { key: 'medical', label: '医疗健康' },
  { key: 'door', label: '上门服务' },
  { key: 'extra', label: '商品与增值' },
];

const PRICE_RANGES = [
  { key: 'all', label: '不限', min: 0, max: Infinity },
  { key: '0-50', label: '50以下', min: 0, max: 50 },
  { key: '50-100', label: '50-100', min: 50, max: 100 },
  { key: '100-200', label: '100-200', min: 100, max: 200 },
  { key: '200+', label: '200以上', min: 200, max: Infinity },
];

Page({
  data: {
    categoryList: CATEGORY_LIST,
    priceRanges: PRICE_RANGES,
    activeCategory: 'all',
    activePrice: 'all',
    serviceList: [],
    loading: true,
    searchVal: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    _allServices: [],
    _agencyMap: {},
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadServices();
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadServices() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const services = res.data || [];

      // Collect unique agencyProfileIds and load agency names
      const profileIds = [...new Set(services.map(s => s.agencyProfileId).filter(Boolean))];
      const agencyMap = {};
      if (profileIds.length > 0) {
        try {
          const agencyRes = await db.collection('agency_profiles')
            .where({ _id: db.command.in(profileIds) })
            .field({ _id: true, orgName: true })
            .get();
          (agencyRes.data || []).forEach(a => { agencyMap[a._id] = a.orgName; });
        } catch (e) { /* ignore */ }
      }

      // Resolve image URLs
      const allFileIDs = [];
      services.forEach(s => {
        if (s.images && s.images.length) allFileIDs.push(...s.images);
      });
      const resolvedUrls = await resolveTempUrls([...new Set(allFileIDs)]);
      const urlMap = {};
      const uniqueIDs = [...new Set(allFileIDs)];
      uniqueIDs.forEach((id, i) => { urlMap[id] = resolvedUrls[i]; });

      services.forEach(s => {
        if (s.images) s.images = s.images.map(id => urlMap[id] || id);
        s._agencyName = agencyMap[s.agencyProfileId] || '';
      });

      this.setData({ _allServices: services, _agencyMap: agencyMap });
      this.applyFilters();
    } catch (e) {
      this.setData({ serviceList: [], loading: false });
    }
  },

  applyFilters() {
    const { activeCategory, activePrice, searchVal, _allServices } = this.data;
    const priceRange = PRICE_RANGES.find(p => p.key === activePrice) || PRICE_RANGES[0];

    let list = _allServices;

    if (activeCategory !== 'all') {
      list = list.filter(s => s.category === activeCategory);
    }

    if (activePrice !== 'all') {
      list = list.filter(s => {
        const price = Number(s.price) || 0;
        return price >= priceRange.min && price < priceRange.max;
      });
    }

    if (searchVal.trim()) {
      const kw = searchVal.trim().toLowerCase();
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s._agencyName && s._agencyName.toLowerCase().includes(kw)) ||
        (s.desc && s.desc.toLowerCase().includes(kw))
      );
    }

    this.setData({ serviceList: list, loading: false });
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeCategory: key });
    this.applyFilters();
  },

  onPriceTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activePrice: key });
    this.applyFilters();
  },

  onSearchChange(e) {
    this.setData({ searchVal: e.detail });
  },

  onSearch() {
    this.applyFilters();
  },

  onServiceTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onPullDownRefresh() {
    this.loadServices();
    wx.stopPullDownRefresh();
  },
});
