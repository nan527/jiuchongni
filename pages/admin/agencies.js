// pages/admin/agencies.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');
const regionData = require('../../utils/regionData');

const TIME_OPTIONS = [
  { key: 'all', label: '全部时间' },
  { key: 'week', label: '最近一周' },
  { key: 'month', label: '最近一月' },
  { key: 'quarter', label: '最近三月' },
];

Page({
  data: {
    loading: true,
    agencyList: [],
    filteredList: [],
    searchVal: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    // 时间筛选
    timeOptions: TIME_OPTIONS,
    timeFilter: 'all',
    // 地区筛选
    regionText: '全部地区',
    showRegionPicker: false,
    // 联动数据
    provinces: [],
    cities: [],
    districts: [],
    selectedProvince: '',
    selectedCity: '',
    selectedDistrict: '',
    provinceIdx: 0,
    cityIdx: 0,
    districtIdx: 0,
    pickerTab: 'province',
    // 统计
    totalCount: 0,
    filteredCount: 0,
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;

    const provinces = regionData.map(item => item.p);

    this.setData({ statusBarHeight, navBarHeight, provinces });
  },

  onGoBack() {
    wx.navigateBack();
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
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const list = (res.data || []).map(item => ({
        ...item,
        createTimeStr: this._formatDate(item.createTime),
      }));

      this.setData({
        agencyList: list,
        totalCount: list.length,
        loading: false,
      });

      this.applyFilters();
    } catch (e) {
      console.error('[agencies] loadAgencies', e);
      this.setData({ agencyList: [], filteredList: [], loading: false });
    }
  },

  _formatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // ===== 搜索 =====
  onSearchChange(e) {
    this.setData({ searchVal: e.detail });
  },

  onSearch() {
    this.applyFilters();
  },

  onSearchClear() {
    this.setData({ searchVal: '' });
    this.applyFilters();
  },

  // ===== 时间筛选 =====
  onTimeFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.timeFilter) return;
    this.setData({ timeFilter: key });
    this.applyFilters();
  },

  // ===== 地区选择器 =====
  openRegionPicker() {
    this.setData({ showRegionPicker: true, pickerTab: 'province' });
  },

  closeRegionPicker() {
    this.setData({ showRegionPicker: false });
  },

  // 切换 tab
  onPickerTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ pickerTab: tab });
  },

  // 选择省份
  onPickProvince(e) {
    const idx = e.currentTarget.dataset.idx;
    const province = this.data.provinces[idx];
    const cityList = (regionData[idx]?.c || []).map(c => c.n || province);
    const districtList = regionData[idx]?.c?.[0]?.d || [];

    this.setData({
      provinceIdx: idx,
      selectedProvince: province,
      cities: cityList,
      cityIdx: 0,
      selectedCity: cityList[0] || '',
      districts: districtList,
      districtIdx: 0,
      selectedDistrict: '',
      pickerTab: 'city',
    });
  },

  // 选择城市
  onPickCity(e) {
    const idx = e.currentTarget.dataset.idx;
    const city = this.data.cities[idx];
    const provinceIdx = this.data.provinceIdx;
    const districtList = regionData[provinceIdx]?.c?.[idx]?.d || [];

    this.setData({
      cityIdx: idx,
      selectedCity: city,
      districts: districtList,
      districtIdx: 0,
      selectedDistrict: '',
      pickerTab: 'district',
    });
  },

  // 选择区县
  onPickDistrict(e) {
    const idx = e.currentTarget.dataset.idx;
    const district = this.data.districts[idx];

    this.setData({
      districtIdx: idx,
      selectedDistrict: district,
    });

    // 自动确认
    this.confirmRegion();
  },

  // 确认地区选择
  confirmRegion() {
    const { selectedProvince, selectedCity, selectedDistrict } = this.data;
    let text = '全部地区';
    let matchParts = [];

    if (selectedProvince) {
      matchParts.push(selectedProvince.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区/, ''));
      text = selectedProvince;
    }
    if (selectedCity) {
      matchParts.push(selectedCity.replace(/市|地区|州|盟/, ''));
      text = selectedCity;
    }
    if (selectedDistrict) {
      matchParts.push(selectedDistrict);
      text = selectedDistrict;
    }

    this.setData({
      regionText: text,
      showRegionPicker: false,
      _regionMatchParts: matchParts,
    });

    this.applyFilters();
  },

  // 重置地区
  resetRegion() {
    this.setData({
      regionText: '全部地区',
      showRegionPicker: false,
      selectedProvince: '',
      selectedCity: '',
      selectedDistrict: '',
      provinceIdx: 0,
      cityIdx: 0,
      districtIdx: 0,
      cities: [],
      districts: [],
      _regionMatchParts: [],
    });
    this.applyFilters();
  },

  // ===== 综合筛选 =====
  applyFilters() {
    const { agencyList, searchVal, timeFilter } = this.data;
    const keyword = searchVal.trim().toLowerCase();
    const matchParts = this.data._regionMatchParts || [];
    const now = Date.now();
    const timeRanges = {
      week: 7 * 86400000,
      month: 30 * 86400000,
      quarter: 90 * 86400000,
    };

    let filtered = [...agencyList];

    // 关键词搜索
    if (keyword) {
      filtered = filtered.filter(item => {
        const name = (item.orgName || '').toLowerCase();
        const addr = (item.detailAddress || '').toLowerCase();
        const region = (item.region || '').toLowerCase();
        const contact = (item.legalName || '').toLowerCase();
        return name.includes(keyword) || addr.includes(keyword) || region.includes(keyword) || contact.includes(keyword);
      });
    }

    // 时间筛选
    if (timeFilter !== 'all' && timeRanges[timeFilter]) {
      const cutoff = now - timeRanges[timeFilter];
      filtered = filtered.filter(item => {
        const t = item.createTime ? new Date(item.createTime).getTime() : 0;
        return t >= cutoff;
      });
    }

    // 地区筛选（模糊匹配 region 字段）
    if (matchParts.length > 0) {
      filtered = filtered.filter(item => {
        const region = (item.region || '').toLowerCase();
        return matchParts.every(part => region.includes(part.toLowerCase()));
      });
    }

    this.setData({
      filteredList: filtered,
      filteredCount: filtered.length,
    });
  },

  // 查看详情
  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  // 删除机构
  deleteAgency(e) {
    const { profileId, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${name || '该机构'}」吗？删除后将无法恢复。`,
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
            wx.showToast({ title: result.result?.msg || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
