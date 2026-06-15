// pages/admin/audit.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');
const regionData = require('../../utils/regionData');

Page({
  data: {
    activeTab: 0,
    pendingList: [],
    historyList: [],
    filteredPendingList: [],
    filteredHistoryList: [],
    loading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
    // 时间筛选
    timeFilter: '',
    showTimeDropdown: false,
    // 状态筛选
    statusFilter: '',
    showStatusDropdown: false,
    // 地区筛选 - 三级联动
    regionText: '全部地区',
    showRegionPicker: false,
    provinces: [],
    cities: [],
    districts: [],
    selectedProvince: '',
    selectedCity: '',
    selectedDistrict: '',
    provinceIdx: -1,
    cityIdx: -1,
    districtIdx: -1,
    pickerTab: 'province',
    _regionMatchParts: [],
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
    this.loadPendingList();
    this.loadHistoryList();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.index });
  },

  goDetail(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/audit-detail?userId=${userId}&profileId=${profileId}`,
    });
  },

  // ===== 时间筛选 =====
  onTimeFilterTap() {
    this.setData({
      showTimeDropdown: !this.data.showTimeDropdown,
      showStatusDropdown: false,
    });
  },

  onSelectTimeFilter(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ timeFilter: value, showTimeDropdown: false });
    this.applyFilters();
  },

  // ===== 状态筛选 =====
  onStatusFilterTap() {
    this.setData({
      showStatusDropdown: !this.data.showStatusDropdown,
      showTimeDropdown: false,
    });
  },

  onSelectStatusFilter(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ statusFilter: value, showStatusDropdown: false });
    this.applyFilters();
  },

  onCloseDropdown() {
    this.setData({ showTimeDropdown: false, showStatusDropdown: false });
  },

  stopPropagation() {},

  // ===== 地区三级联动选择器 =====
  openRegionPicker() {
    this.setData({ showRegionPicker: true, pickerTab: 'province' });
  },

  closeRegionPicker() {
    this.setData({ showRegionPicker: false });
  },

  onPickerTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ pickerTab: tab });
  },

  onPickProvince(e) {
    const idx = e.currentTarget.dataset.idx;
    const province = this.data.provinces[idx];
    const cityList = (regionData[idx]?.c || []).map(c => c.n || province);
    const districtList = regionData[idx]?.c?.[0]?.d || [];
    this.setData({
      provinceIdx: idx,
      selectedProvince: province,
      cities: cityList,
      cityIdx: -1,
      selectedCity: '',
      districts: districtList,
      districtIdx: -1,
      selectedDistrict: '',
      pickerTab: 'city',
    });
  },

  onPickCity(e) {
    const idx = e.currentTarget.dataset.idx;
    const city = this.data.cities[idx];
    const provinceIdx = this.data.provinceIdx;
    const districtList = regionData[provinceIdx]?.c?.[idx]?.d || [];
    this.setData({
      cityIdx: idx,
      selectedCity: city,
      districts: districtList,
      districtIdx: -1,
      selectedDistrict: '',
      pickerTab: 'district',
    });
  },

  onPickDistrict(e) {
    const idx = e.currentTarget.dataset.idx;
    const district = this.data.districts[idx];
    this.setData({ districtIdx: idx, selectedDistrict: district });
    this.confirmRegion();
  },

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
    this.setData({ regionText: text, showRegionPicker: false, _regionMatchParts: matchParts });
    this.applyFilters();
  },

  resetRegion() {
    this.setData({
      regionText: '全部地区',
      showRegionPicker: false,
      selectedProvince: '',
      selectedCity: '',
      selectedDistrict: '',
      provinceIdx: -1,
      cityIdx: -1,
      districtIdx: -1,
      cities: [],
      districts: [],
      _regionMatchParts: [],
    });
    this.applyFilters();
  },

  // ===== 综合筛选 =====
  applyFilters() {
    const { timeFilter, statusFilter, pendingList, historyList } = this.data;
    const matchParts = this.data._regionMatchParts || [];
    const now = new Date();

    const filterByTime = (item) => {
      if (!timeFilter) return true;
      const createTime = item.createTime;
      if (!createTime) return false;
      const itemDate = new Date(createTime);
      const diffDays = (now - itemDate) / (1000 * 60 * 60 * 24);
      switch (timeFilter) {
        case '今日': return itemDate.toDateString() === now.toDateString();
        case '本周': return diffDays <= 7;
        case '本月': return diffDays <= 30;
        case '近三月': return diffDays <= 90;
        case '近半年': return diffDays <= 180;
        case '近一年': return diffDays <= 365;
        default: return true;
      }
    };

    const filterByRegion = (item) => {
      if (matchParts.length === 0) return true;
      const region = (item.profile.region || '').toLowerCase();
      return matchParts.every(part => region.includes(part.toLowerCase()));
    };

    const filterByStatus = (item) => {
      if (!statusFilter) return true;
      const statusMap = { '待审核': 'pending', '已通过': 'approved', '已驳回': 'rejected' };
      return item.auditStatus === statusMap[statusFilter];
    };

    const filteredPendingList = pendingList.filter(item =>
      filterByTime(item) && filterByRegion(item) && filterByStatus(item)
    );
    const filteredHistoryList = historyList.filter(item =>
      filterByTime(item) && filterByRegion(item) && filterByStatus(item)
    );

    this.setData({ filteredPendingList, filteredHistoryList });
  },

  async loadPendingList() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const userRes = await db.collection('users')
        .where({ role: 'agency', auditStatus: _.in(['pending', 'rejected']) })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const users = userRes.data || [];
      if (!users.length) {
        this.setData({ pendingList: [], filteredPendingList: [], loading: false });
        return;
      }
      const profileIds = users.map((u) => u.agencyProfileId).filter(Boolean);
      let profileMap = {};
      if (profileIds.length) {
        const profileRes = await db.collection('agency_profiles').where({ _id: _.in(profileIds) }).get();
        profileMap = (profileRes.data || []).reduce((m, p) => { m[p._id] = p; return m; }, {});
      }
      // 解析图片 cloud:// ID 为临时 URL
      const pendingList = users.map((u) => ({
        userId: u._id,
        account: u.account || '',
        auditStatus: u.auditStatus || 'pending',
        createTime: u.createTime,
        profile: profileMap[u.agencyProfileId] || {},
      }));
      // 收集所有需要解析的图片 ID
      const fileIDs = [];
      pendingList.forEach((item) => {
        const p = item.profile;
        if (p.licenseImage && p.licenseImage.startsWith('cloud://')) fileIDs.push(p.licenseImage);
        if (p.storefrontImage && p.storefrontImage.startsWith('cloud://')) fileIDs.push(p.storefrontImage);
        if (p.permitImage && p.permitImage.startsWith('cloud://')) fileIDs.push(p.permitImage);
      });
      if (fileIDs.length) {
        try {
          const urlRes = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'get_file_urls', fileIDs },
          });
          const urls = (urlRes.result && urlRes.result.urls) || [];
          const urlMap = {};
          fileIDs.forEach((id, i) => { urlMap[id] = urls[i] || id; });
          pendingList.forEach((item) => {
            const p = item.profile;
            if (p.licenseImage && urlMap[p.licenseImage]) p.licenseImage = urlMap[p.licenseImage];
            if (p.storefrontImage && urlMap[p.storefrontImage]) p.storefrontImage = urlMap[p.storefrontImage];
            if (p.permitImage && urlMap[p.permitImage]) p.permitImage = urlMap[p.permitImage];
          });
        } catch (e) { /* 图片解析失败不影响列表显示 */ }
      }
      this.setData({
        pendingList,
        filteredPendingList: pendingList,
        loading: false,
      });
      this.applyFilters();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadHistoryList() {
    try {
      const db = wx.cloud.database();
      const userRes = await db.collection('users')
        .where({ role: 'agency' })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const users = userRes.data || [];
      if (!users.length) {
        this.setData({ historyList: [], filteredHistoryList: [] });
        return;
      }
      const profileIds = users.map((u) => u.agencyProfileId).filter(Boolean);
      const _ = db.command;
      let profileMap = {};
      if (profileIds.length) {
        const profileRes = await db.collection('agency_profiles').where({ _id: _.in(profileIds) }).get();
        profileMap = (profileRes.data || []).reduce((m, p) => { m[p._id] = p; return m; }, {});
      }
      const historyList = users.map((u) => ({
        userId: u._id,
        account: u.account || '',
        auditStatus: u.auditStatus || 'pending',
        createTime: u.createTime,
        profile: profileMap[u.agencyProfileId] || {},
      }));
      this.setData({
        historyList,
        filteredHistoryList: historyList,
      });
      this.applyFilters();
    } catch (err) { /* ignore */ }
  },

  async approve(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    await this.updateAudit(userId, profileId, 'approved');
  },

  async reject(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    await this.updateAudit(userId, profileId, 'rejected');
  },

  async updateAudit(userId, profileId, status) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'update_agency_audit', userId, profileId, status },
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回', icon: 'success' });
        this.loadPendingList();
        this.loadHistoryList();
      } else {
        wx.showToast({ title: '操作失败: ' + (res.result.msg || '未知错误'), icon: 'none' });
      }
    } catch (err) {
      console.error('[Audit] updateAudit error', err);
      wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
    }
  },

  deleteAgency(e) {
    const { userId, profileId } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后该机构账号和资料将被永久清除，确定删除吗？',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'delete_agency', userId, profileId },
          });
          wx.hideLoading();
          if (result.result && result.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadPendingList();
            this.loadHistoryList();
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
