// pages/browse-agencies/browse-agencies.js
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');
const { getStatusBarHeight, CAT_TITLE_MAP } = require('../../utils/helpers');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ===== 距离计算（Haversine 公式）=====
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km) {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`;
  return `${km.toFixed(1)}km`;
}

// 根据营业时间字符串判断是否营业中，支持格式如 09:00-21:00
function isBusinessOpen(businessHours) {
  if (!businessHours) return false;
  const match = businessHours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const now = new Date();
  const startH = parseInt(match[1], 10);
  const startM = parseInt(match[2], 10);
  const endH = parseInt(match[3], 10);
  const endM = parseInt(match[4], 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

const AGENCY_TYPE_LIST = [
  { key: 'all', label: '全部' },
  { key: '宠物寄养机构', label: '寄养机构' },
  { key: '宠物医院', label: '宠物医院' },
  { key: '宠物美容洗护', label: '美容洗护' },
  { key: '宠物用品店', label: '用品店' },
  { key: '综合服务', label: '综合服务' },
];

const SERVICE_CATEGORY_LIST = [
  { key: 'all', label: '全部' },
  { key: 'foster', label: '宠物寄养' },
  { key: 'grooming', label: '美容洗护' },
  { key: 'medical', label: '医疗健康' },
  { key: 'door', label: '上门服务' },
];

Page({
  data: {
    // Tab 切换：agency | service
    activeTab: 'agency',

    // 机构相关
    agencyTypeList: AGENCY_TYPE_LIST,
    serviceCategoryList: SERVICE_CATEGORY_LIST,
    activeType: 'all',
    agencyList: [],
    _allAgencies: [],
    _agenciesLoaded: false,

    // 服务相关
    activeCategory: 'all',
    serviceList: [],
    _allServices: [],
    _agencyMap: {},
    _servicesLoaded: false,

    // 筛选面板
    showFilterPanel: false,
    minPrice: 0,
    maxPrice: 1000,
    priceRange: [0, 1000],
    selectedRegionArray: [],
    selectedRegionText: '',
    minRating: 0,
    sortByDistance: false,
    isOpenNow: false,

    // 位置
    userLocation: null,
    locationAuthStatus: 'unknown',

    // 地图
    showMap: false,
    mapLatitude: 39.9042,
    mapLongitude: 116.4074,
    mapMarkers: [],

    // 评分
    _agencyRatingMap: {},

    // 公共
    loading: true,
    searchVal: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    navBarContentHeight: 0,
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarContentHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    const navBarHeight = statusBarHeight + navBarContentHeight;
    this.setData({ statusBarHeight, navBarHeight, navBarContentHeight });

    // 请求位置权限
    this.requestLocation();

    // 加载评分数据
    this.loadAgencyRatings();

    // 如果有tab参数，切换到对应标签
    if (options.tab === 'service') {
      this.setData({ activeTab: 'service' });
    }

    // 如果有keyword参数，直接执行搜索
    if (options.keyword) {
      this.setData({ searchVal: options.keyword });
      if (this.data.activeTab === 'service') {
        this.loadServices().then(() => {
          this.searchServices(options.keyword);
        });
      } else {
        this.loadAllAgencies().then(() => {
          this.applyAllFilters();
        });
      }
    } else {
      if (this.data.activeTab === 'service') {
        this.loadServices();
      } else {
        this.loadAllAgencies();
      }
    }
  },

  onGoBack() {
    wx.navigateBack();
  },

  // ========== Tab 切换 ==========
  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;

    this.setData({ activeTab: tab, activeType: 'all', activeCategory: 'all' });

    if (tab === 'service') {
      if (!this.data._servicesLoaded) {
        this.loadServices().then(() => {
          if (this.data.searchVal.trim()) {
            this.applyServiceFilters();
          }
        });
      } else if (this.data.searchVal.trim()) {
        this.applyServiceFilters();
      } else {
        this.applyServiceFilters();
      }
    } else {
      if (!this.data._agenciesLoaded) {
        this.loadAllAgencies();
      } else if (this.data.searchVal.trim()) {
        this.applyAllFilters();
      } else {
        this.applyAllFilters();
      }
    }
  },

  // ========== 机构相关 ==========
  async loadAgencies(businessType) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    let query = { auditStatus: 'approved' };

    if (businessType && businessType !== 'all') {
      query.businessType = businessType;
    }

    try {
      const res = await withTimeout(
        db.collection('agency_profiles')
          .where(query)
          .orderBy('createTime', 'desc')
          .limit(50)
          .get(),
        8000
      );
      const list = await resolveAgencyImages(res.data || []);
      this.setData({ agencyList: list, loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
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

      const res = await withTimeout(
        db.collection('agency_profiles')
          .where(whereCondition)
          .orderBy('createTime', 'desc')
          .limit(50)
          .get(),
        8000
      );
      const list = await resolveAgencyImages(res.data || []);
      this.setData({ agencyList: list, loading: false });
    } catch (e) {
      this.setData({ agencyList: [], loading: false });
    }
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeType: key });
    this.applyAllFilters();
  },

  // ========== 服务相关 ==========
  async loadServices() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('agency_services')
          .orderBy('createTime', 'desc')
          .limit(100)
          .get(),
        8000
      );
      const services = res.data || [];

      // 加载机构名称
      const profileIds = [...new Set(services.map(s => s.agencyProfileId).filter(Boolean))];
      const agencyMap = {};
      if (profileIds.length > 0) {
        try {
          const agencyRes = await withTimeout(
            db.collection('agency_profiles')
              .where({ _id: db.command.in(profileIds) })
              .field({ _id: true, orgName: true, region: true, latitude: true, longitude: true, businessHours: true })
              .get(),
            8000
          );
          (agencyRes.data || []).forEach(a => {
            agencyMap[a._id] = {
              orgName: a.orgName,
              region: a.region,
              latitude: a.latitude,
              longitude: a.longitude,
              businessHours: a.businessHours,
            };
          });
        } catch (e) { /* ignore */ }
      }

      // 解析图片URL
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
        const agency = agencyMap[s.agencyProfileId];
        s._agencyName = agency ? agency.orgName : '';
        s._catTitle = CAT_TITLE_MAP[s.category] || '服务';
      });

      this.setData({
        _allServices: services,
        _agencyMap: agencyMap,
        _servicesLoaded: true,
      });
      this.applyServiceFilters();
    } catch (e) {
      this.setData({ serviceList: [], loading: false });
    }
  },

  applyServiceFilters() {
    const { activeCategory, searchVal, _allServices } = this.data;

    let list = _allServices;
    let effectiveCategory = activeCategory;

    // 若未选择具体分类，根据搜索关键词推断分类
    if (activeCategory === 'all' && searchVal.trim()) {
      const kw = searchVal.trim();
      const categoryMap = {
        '寄养': 'foster',
        '宠物寄养': 'foster',
        '美容': 'grooming',
        '洗护': 'grooming',
        '美容洗护': 'grooming',
        '医疗': 'medical',
        '健康': 'medical',
        '医疗健康': 'medical',
        '上门': 'door',
        '上门服务': 'door',
      };
      for (const [key, cat] of Object.entries(categoryMap)) {
        if (kw.includes(key)) {
          effectiveCategory = cat;
          break;
        }
      }
    }

    if (effectiveCategory !== 'all') {
      list = list.filter(s => s.category === effectiveCategory);
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

  searchServices(keyword) {
    this.setData({ searchVal: keyword });
    this.applyServiceFilters();
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeCategory: key });

    // 同机构标签修复：保留搜索关键词
    this.applyServiceFilters();
  },

  // ========== 搜索公共 ==========
  onSearchChange(e) {
    this.setData({ searchVal: e.detail.value !== undefined ? e.detail.value : e.detail });
  },

  onSearch() {
    const { activeTab } = this.data;
    if (activeTab === 'service') {
      this.applyServiceFilters();
    } else {
      this.applyAllFilters();
    }
  },

  onSearchClear() {
    this.setData({ searchVal: '' });
    const { activeTab } = this.data;
    if (activeTab === 'service') {
      this.applyServiceFilters();
    } else {
      this.applyAllFilters();
    }
  },

  // ========== 跳转详情 ==========
  onAgencyTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  onServiceTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onPullDownRefresh() {
    const { activeTab, activeType, searchVal } = this.data;
    if (activeTab === 'service') {
      this.loadServices();
    } else if (searchVal.trim()) {
      this.loadAllAgencies().then(() => this.applyAllFilters());
    } else {
      this.loadAllAgencies();
    }
    wx.stopPullDownRefresh();
  },

  // ========== 位置权限 ==========
  async requestLocation() {
    try {
      const setting = await wx.getSetting();
      const auth = setting.authSetting['scope.userLocation'];
      if (auth === true) {
        const loc = await wx.getLocation({ type: 'gcj02' });
        this.setData({
          userLocation: { latitude: loc.latitude, longitude: loc.longitude },
          locationAuthStatus: 'granted',
          mapLatitude: loc.latitude,
          mapLongitude: loc.longitude,
        });
      } else if (auth === false) {
        this.setData({ locationAuthStatus: 'denied' });
      } else {
        try {
          const loc = await wx.getLocation({ type: 'gcj02' });
          this.setData({
            userLocation: { latitude: loc.latitude, longitude: loc.longitude },
            locationAuthStatus: 'granted',
            mapLatitude: loc.latitude,
            mapLongitude: loc.longitude,
          });
        } catch (e) {
          this.setData({ locationAuthStatus: 'denied' });
        }
      }
    } catch (e) {
      this.setData({ locationAuthStatus: 'denied' });
    }
  },

  onOpenSetting() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          this.requestLocation();
        }
      },
    });
  },

  // 手动选择位置（权限被拒绝时的替代方案）
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          userLocation: { latitude: res.latitude, longitude: res.longitude },
          locationAuthStatus: 'manual',
          mapLatitude: res.latitude,
          mapLongitude: res.longitude,
        });
        // 重新应用筛选与排序
        const { activeTab } = this.data;
        if (activeTab === 'service') {
          this.applyServiceFilters();
        } else {
          this.loadAllAgencies();
        }
      },
      fail: (err) => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择位置失败', icon: 'none' });
        }
      },
    });
  },

  // ========== 评分加载 ==========
  async loadAgencyRatings() {
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('user_orders')
          .where({
            orderStatus: db.command.in(['completed', 'to_confirm']),
            'review.rating': db.command.exists(true),
          })
          .field({ agencyProfileId: true, 'review.rating': true })
          .limit(500)
          .get(),
        8000
      );

      const ratingMap = {};
      const countMap = {};
      (res.data || []).forEach(order => {
        const id = order.agencyProfileId;
        if (!id) return;
        const rating = order.review?.rating || 0;
        ratingMap[id] = (ratingMap[id] || 0) + rating;
        countMap[id] = (countMap[id] || 0) + 1;
      });

      const avgMap = {};
      Object.keys(ratingMap).forEach(id => {
        avgMap[id] = Number((ratingMap[id] / countMap[id]).toFixed(1));
      });

      this.setData({ _agencyRatingMap: avgMap });
      // 评分加载完成后，如果已经在机构Tab且已加载机构，重新应用筛选以更新评分显示
      if (this.data.activeTab === 'agency' && this.data._agenciesLoaded) {
        this.applyAllFilters();
      }
    } catch (e) {
      console.error('[BrowseAgencies] 加载评分失败', e);
    }
  },

  // ========== 加载所有机构（前端筛选）==========
  async loadAllAgencies() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('agency_profiles')
          .where({ auditStatus: 'approved' })
          .orderBy('createTime', 'desc')
          .limit(200)
          .get(),
        8000
      );
      let list = await resolveAgencyImages(res.data || []);

      // 补充评分和距离
      const { _agencyRatingMap, userLocation } = this.data;
      list = list.map(item => {
        const rating = _agencyRatingMap[item._id] || 0;
        let distance = null;
        let distanceStr = '';
        if (userLocation && item.latitude && item.longitude) {
          distance = calcDistance(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude);
          distanceStr = formatDistance(distance);
        }
        return { ...item, _rating: rating, _distance: distance, _distanceStr: distanceStr };
      });

      this.setData({
        _allAgencies: list,
        _agenciesLoaded: true,
      });
      this.applyAllFilters();
    } catch (e) {
      console.error('[BrowseAgencies] 加载机构失败', e);
      this.setData({ agencyList: [], loading: false });
    }
  },

  // ========== 组合筛选（机构）==========
  applyAllFilters() {
    const {
      _allAgencies,
      activeType,
      searchVal,
      selectedRegionArray,
      minRating,
      sortByDistance,
      isOpenNow,
    } = this.data;

    let list = [..._allAgencies];

    // 类型筛选
    if (activeType !== 'all') {
      list = list.filter(a => a.businessType === activeType);
    }

    // 区域筛选（省市区匹配）
    if (selectedRegionArray && selectedRegionArray.length > 0) {
      list = list.filter(a => {
        if (!a.region) return false;
        return selectedRegionArray.some(level => a.region.includes(level));
      });
    }

    // 评分筛选
    if (minRating > 0) {
      list = list.filter(a => (a._rating || 0) >= minRating);
    }

    // 营业中筛选
    if (isOpenNow) {
      list = list.filter(a => isBusinessOpen(a.businessHours));
    }

    // 搜索关键词
    if (searchVal.trim()) {
      const kw = searchVal.trim().toLowerCase();
      list = list.filter(a =>
        (a.orgName && a.orgName.toLowerCase().includes(kw)) ||
        (a.detailAddress && a.detailAddress.toLowerCase().includes(kw)) ||
        (a.region && a.region.toLowerCase().includes(kw)) ||
        (a.orgIntro && a.orgIntro.toLowerCase().includes(kw))
      );
    }

    // 距离排序
    if (sortByDistance) {
      list.sort((a, b) => {
        const da = a._distance != null ? a._distance : Infinity;
        const db = b._distance != null ? b._distance : Infinity;
        return da - db;
      });
    }

    this.setData({ agencyList: list, loading: false });
    this.updateMapMarkers();
  },

  // ========== 组合筛选（服务）==========
  applyServiceFilters() {
    const {
      activeCategory,
      searchVal,
      _allServices,
      priceRange,
      minRating,
      selectedRegionArray,
      sortByDistance,
      isOpenNow,
    } = this.data;

    let list = _allServices;
    let effectiveCategory = activeCategory;

    // 关键词推断分类
    if (activeCategory === 'all' && searchVal.trim()) {
      const kw = searchVal.trim();
      const categoryMap = {
        '寄养': 'foster',
        '宠物寄养': 'foster',
        '美容': 'grooming',
        '洗护': 'grooming',
        '美容洗护': 'grooming',
        '医疗': 'medical',
        '健康': 'medical',
        '医疗健康': 'medical',
        '上门': 'door',
        '上门服务': 'door',
      };
      for (const [key, cat] of Object.entries(categoryMap)) {
        if (kw.includes(key)) {
          effectiveCategory = cat;
          break;
        }
      }
    }

    if (effectiveCategory !== 'all') {
      list = list.filter(s => s.category === effectiveCategory);
    }

    // 价格区间筛选
    const [minPrice, maxPrice] = priceRange;
    if (minPrice > 0 || maxPrice < 1000) {
      list = list.filter(s => {
        const price = Number(s.price) || 0;
        return price >= minPrice && price <= maxPrice;
      });
    }

    // 区域筛选（基于机构省市区）
    if (selectedRegionArray && selectedRegionArray.length > 0) {
      list = list.filter(s => {
        const agency = this.data._agencyMap[s.agencyProfileId];
        if (!agency || !agency.region) return false;
        return selectedRegionArray.some(level => agency.region.includes(level));
      });
    }

    // 评分筛选
    if (minRating > 0) {
      const { _agencyRatingMap } = this.data;
      list = list.filter(s => (_agencyRatingMap[s.agencyProfileId] || 0) >= minRating);
    }

    // 营业中筛选（基于机构营业时间）
    if (isOpenNow) {
      const { _agencyMap } = this.data;
      list = list.filter(s => {
        const agency = _agencyMap[s.agencyProfileId];
        return agency && isBusinessOpen(agency.businessHours);
      });
    }

    // 搜索关键词
    if (searchVal.trim()) {
      const kw = searchVal.trim().toLowerCase();
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s._agencyName && s._agencyName.toLowerCase().includes(kw)) ||
        (s.desc && s.desc.toLowerCase().includes(kw))
      );
    }

    // 距离计算与排序（基于机构位置）
    const { _agencyMap, userLocation } = this.data;
    if (userLocation) {
      list = list.map(s => {
        const agency = _agencyMap[s.agencyProfileId];
        let dist = null;
        let distStr = '';
        if (agency && agency.latitude && agency.longitude) {
          dist = calcDistance(userLocation.latitude, userLocation.longitude, agency.latitude, agency.longitude);
          distStr = formatDistance(dist);
        }
        return { ...s, _distance: dist, _distanceStr: distStr };
      });
      if (sortByDistance) {
        list.sort((a, b) => {
          const da = a._distance != null ? a._distance : Infinity;
          const db = b._distance != null ? b._distance : Infinity;
          return da - db;
        });
      }
    }

    this.setData({ serviceList: list, loading: false });
  },

  // ========== 筛选面板控制 ==========
  openFilterPanel() {
    this.setData({ showFilterPanel: true });
  },

  closeFilterPanel() {
    this.setData({ showFilterPanel: false });
  },

  onPriceChange(e) {
    this.setData({ priceRange: e.detail });
  },

  onRegionPickerChange(e) {
    const arr = e.detail.value;
    const text = arr.join(' / ');
    this.setData({
      selectedRegionArray: arr,
      selectedRegionText: text,
    });
  },

  onRatingChange(e) {
    this.setData({ minRating: e.detail });
  },

  onSortByDistanceChange(e) {
    this.setData({ sortByDistance: e.detail });
  },

  onOpenNowChange(e) {
    this.setData({ isOpenNow: e.detail });
  },

  resetFilters() {
    this.setData({
      priceRange: [0, 1000],
      selectedRegionArray: [],
      selectedRegionText: '',
      minRating: 0,
      sortByDistance: false,
      isOpenNow: false,
    });
  },

  confirmFilters() {
    this.closeFilterPanel();
    const { activeTab } = this.data;
    if (activeTab === 'service') {
      this.applyServiceFilters();
    } else {
      this.applyAllFilters();
    }
  },

  // ========== 地图 ==========
  toggleMap() {
    const { showMap } = this.data;
    this.setData({ showMap: !showMap });
    if (!showMap) {
      this.updateMapMarkers();
    }
  },

  updateMapMarkers() {
    const { activeTab, agencyList, serviceList, userLocation, _agencyMap } = this.data;
    const list = activeTab === 'agency' ? agencyList : serviceList;

    const markers = list
      .filter((item, index) => {
        const lat = activeTab === 'agency' ? item.latitude : (_agencyMap[item.agencyProfileId]?.latitude);
        const lon = activeTab === 'agency' ? item.longitude : (_agencyMap[item.agencyProfileId]?.longitude);
        return lat && lon;
      })
      .map((item, index) => {
        const isAgency = activeTab === 'agency';
        const lat = isAgency ? item.latitude : (_agencyMap[item.agencyProfileId]?.latitude);
        const lon = isAgency ? item.longitude : (_agencyMap[item.agencyProfileId]?.longitude);
        return {
          id: index,
          latitude: lat,
          longitude: lon,
          title: isAgency ? item.orgName : item.name,
          iconPath: '/static/pet/logo.png',
          width: 40,
          height: 40,
        };
      });

    // 添加用户位置标记
    if (userLocation) {
      markers.push({
        id: 9999,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        title: '我的位置',
        iconPath: '/static/pet/logo.png',
        width: 40,
        height: 40,
      });
    }

    this.setData({ mapMarkers: markers });
  },

  onMapMarkerTap(e) {
    const { markerId } = e.detail;
    const { activeTab, agencyList, serviceList } = this.data;
    const list = activeTab === 'agency' ? agencyList : serviceList;
    const item = list[markerId];
    if (item) {
      const url = activeTab === 'agency'
        ? `/pages/agency-detail/agency-detail?id=${item._id}`
        : `/pages/service-detail/service-detail?id=${item._id}`;
      wx.navigateTo({ url });
    }
  },
});
