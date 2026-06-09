// pages/smart-match/smart-match.js
const { CAT_TITLE_MAP, getStatusBarHeight } = require('../../utils/helpers');
const { resolveTempUrls } = require('../../utils/fileHelper');

Page({
  data: {
    statusBarHeight: 0,
    navHeight: 0,

    // 折叠控制
    showMoreFilters: false,
    moreFilterCount: 0,

    // 宠物类型
    petTypeOptions: [
      { label: '不限', value: '' },
      { label: '猫咪', value: 'cat' },
      { label: '狗狗', value: 'dog' },
      { label: '兔子', value: 'rabbit' },
      { label: '仓鼠', value: 'hamster' },
      { label: '鸟类', value: 'bird' },
      { label: '水族', value: 'fish' },
      { label: '其他', value: 'other' },
    ],
    selectedPetType: '',
    selectedPetTypeName: '',

    // 宠物体型
    petSizeOptions: [
      { label: '不限', value: '' },
      { label: '小型（<5kg）', value: 'small' },
      { label: '中型（5-15kg）', value: 'medium' },
      { label: '大型（>15kg）', value: 'large' },
    ],
    selectedPetSize: '',
    selectedPetSizeName: '',

    // 宠物年龄
    petAgeOptions: [
      { label: '不限', value: '' },
      { label: '幼年（<1岁）', value: 'baby' },
      { label: '成年（1-7岁）', value: 'adult' },
      { label: '老年（>7岁）', value: 'senior' },
    ],
    selectedPetAge: '',
    selectedPetAgeName: '',

    // 服务类型
    categoryOptions: [
      { label: '全部', value: '' },
      { label: '宠物寄养', value: 'foster' },
      { label: '美容洗护', value: 'grooming' },
      { label: '医疗健康', value: 'medical' },
      { label: '上门服务', value: 'door' },
      { label: '商品增值', value: 'extra' },
    ],
    selectedCategory: '',
    selectedCategoryName: '',

    // 价格范围
    priceMin: '',
    priceMax: '',

    // 时间段
    timeOptions: [
      { label: '不限', value: '' },
      { label: '工作日', value: 'weekday' },
      { label: '周末', value: 'weekend' },
      { label: '节假日', value: 'holiday' },
    ],
    selectedTime: '',
    selectedTimeName: '',

    // 地区
    location: '',

    // 特殊需求
    specialNeedsOptions: [
      { label: '术后护理', value: 'postop' },
      { label: '产后护理', value: 'postpartum' },
      { label: '老年护理', value: 'eldercare' },
      { label: '幼宠照护', value: 'babycare' },
      { label: '皮肤敏感', value: 'sensitive' },
      { label: '行动不便', value: 'mobility' },
    ],
    selectedSpecialNeeds: [],
    selectedSpecialNeedsNames: [],
    specialNeedsMap: {},

    // 个性化需求文本
    customNeeds: '',

    // 结果
    resultList: [],
    loading: false,
    hasFilter: false,

    // 全量服务缓存
    allServices: [],
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navHeight = menuBtn.top + (menuBtn.height - statusBarHeight) / 2 + statusBarHeight;
    this.setData({ statusBarHeight, navHeight });
    this.loadAllServices();
  },

  async loadAllServices() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      const list = res.data || [];
      // 加载机构名称
      for (const svc of list) {
        svc.catTitle = CAT_TITLE_MAP[svc.category] || '服务';
        if (svc.images && svc.images.length) {
          svc.coverImage = (await resolveTempUrls([svc.images[0]]))[0];
        }
        // 尝试加载机构名
        if (svc.agencyId) {
          try {
            const agencyRes = await db.collection('agency_profiles').doc(svc.agencyId).field({ orgName: true }).get();
            svc.agencyName = agencyRes.data.orgName || '';
          } catch (e) {
            svc.agencyName = '';
          }
        }
      }
      this.setData({ allServices: list, resultList: list, loading: false });
    } catch (e) {
      this.setData({ allServices: [], resultList: [], loading: false });
    }
  },

  onCategoryTap(e) {
    const value = e.currentTarget.dataset.value;
    const cat = this.data.categoryOptions.find(o => o.value === value);
    this.setData({ selectedCategory: value, selectedCategoryName: cat ? cat.label : '' });
  },

  onPetTypeTap(e) {
    const value = e.currentTarget.dataset.value;
    const opt = this.data.petTypeOptions.find(o => o.value === value);
    this.setData({ selectedPetType: value, selectedPetTypeName: opt ? opt.label : '' });
    this.updateMoreFilterCount();
  },

  onPetSizeTap(e) {
    const value = e.currentTarget.dataset.value;
    const opt = this.data.petSizeOptions.find(o => o.value === value);
    this.setData({ selectedPetSize: value, selectedPetSizeName: opt ? opt.label : '' });
    this.updateMoreFilterCount();
  },

  onPetAgeTap(e) {
    const value = e.currentTarget.dataset.value;
    const opt = this.data.petAgeOptions.find(o => o.value === value);
    this.setData({ selectedPetAge: value, selectedPetAgeName: opt ? opt.label : '' });
    this.updateMoreFilterCount();
  },

  onSpecialNeedsTap(e) {
    const value = e.currentTarget.dataset.value;
    let selected = [...this.data.selectedSpecialNeeds];
    const idx = selected.indexOf(value);
    if (idx === -1) {
      selected.push(value);
    } else {
      selected.splice(idx, 1);
    }
    const names = selected.map(v => {
      const opt = this.data.specialNeedsOptions.find(o => o.value === v);
      return opt ? opt.label : '';
    }).filter(Boolean);
    // 构建选中状态映射，避免模板中使用 indexOf
    const needsMap = {};
    selected.forEach(v => { needsMap[v] = true; });
    this.setData({ selectedSpecialNeeds: selected, selectedSpecialNeedsNames: names, specialNeedsMap: needsMap });
    this.updateMoreFilterCount();
  },

  onPriceMinInput(e) {
    this.setData({ priceMin: e.detail.value });
  },

  onPriceMaxInput(e) {
    this.setData({ priceMax: e.detail.value });
  },

  onCustomNeedsInput(e) {
    this.setData({ customNeeds: e.detail.value });
  },

  onTimeTap(e) {
    const value = e.currentTarget.dataset.value;
    const opt = this.data.timeOptions.find(o => o.value === value);
    this.setData({ selectedTime: value, selectedTimeName: opt ? opt.label : '' });
    this.updateMoreFilterCount();
  },

  onLocationTap() {
    const regions = ['全部区域', '南山区', '福田区', '罗湖区', '宝安区', '龙岗区', '龙华区', '其他'];
    wx.showActionSheet({
      itemList: regions,
      success: (res) => {
        const selected = regions[res.tapIndex];
        this.setData({ location: selected === '全部区域' ? '' : selected });
        this.updateMoreFilterCount();
      },
    });
  },

  clearLocation() {
    this.setData({ location: '' });
    this.updateMoreFilterCount();
  },

  updateMoreFilterCount() {
    const { selectedPetType, selectedPetSize, selectedPetAge, selectedTime, location, selectedSpecialNeeds, customNeeds } = this.data;
    let count = 0;
    if (selectedPetType) count++;
    if (selectedPetSize) count++;
    if (selectedPetAge) count++;
    if (selectedTime) count++;
    if (location) count++;
    if (selectedSpecialNeeds.length > 0) count++;
    if (customNeeds) count++;
    this.setData({ moreFilterCount: count });
  },

  toggleMoreFilters() {
    this.setData({ showMoreFilters: !this.data.showMoreFilters });
  },

  onMatchTap() {
    this.doFilter();
  },

  doFilter() {
    const {
      allServices, selectedCategory, priceMin, priceMax, selectedTime, location,
      selectedPetType, selectedPetSize, selectedPetAge, selectedSpecialNeeds, customNeeds
    } = this.data;

    const hasFilter = !!(
      selectedCategory || priceMin || priceMax || selectedTime || location ||
      selectedPetType || selectedPetSize || selectedPetAge || selectedSpecialNeeds.length ||
      customNeeds
    );

    if (!hasFilter) {
      this.setData({ resultList: allServices, hasFilter: false });
      return;
    }

    let result = [...allServices];

    // 硬性筛选（不满足条件的直接排除）
    if (selectedCategory) {
      result = result.filter(s => s.category === selectedCategory);
    }
    if (priceMin) {
      result = result.filter(s => Number(s.price) >= Number(priceMin));
    }
    if (priceMax) {
      result = result.filter(s => Number(s.price) <= Number(priceMax));
    }
    if (location) {
      result = result.filter(s => s.region && s.region.includes(location));
    }

    // 智能匹配度计算（多维度加权评分）
    result = result.map(s => {
      let score = 50; // 基础分

      // 服务类型匹配（权重 20）
      if (selectedCategory && s.category === selectedCategory) {
        score += 20;
      }

      // 价格区间匹配（权重 10）
      if (priceMin && Number(s.price) >= Number(priceMin)) score += 5;
      if (priceMax && Number(s.price) <= Number(priceMax)) score += 5;

      // 地区匹配（权重 10）
      if (location && s.region && s.region.includes(location)) {
        score += 10;
      }

      // 时间段匹配（权重 10）
      if (selectedTime && s.availableTime && s.availableTime.includes(selectedTime)) {
        score += 10;
      }

      // 宠物类型匹配（权重 15）
      if (selectedPetType && s.suitablePetTypes && s.suitablePetTypes.includes(selectedPetType)) {
        score += 15;
      }

      // 宠物体型匹配（权重 10）
      if (selectedPetSize && s.suitablePetSizes && s.suitablePetSizes.includes(selectedPetSize)) {
        score += 10;
      }

      // 宠物年龄匹配（权重 10）
      if (selectedPetAge && s.suitablePetAges && s.suitablePetAges.includes(selectedPetAge)) {
        score += 10;
      }

      // 特殊需求匹配（权重 15）
      if (selectedSpecialNeeds.length && s.specialNeeds && s.specialNeeds.length) {
        const matchCount = selectedSpecialNeeds.filter(n => s.specialNeeds.includes(n)).length;
        const matchRatio = matchCount / selectedSpecialNeeds.length;
        score += Math.round(15 * matchRatio);
      }

      // 评分上限 100
      return { ...s, matchScore: Math.min(score, 100) };
    });

    // 按匹配度降序排序
    result.sort((a, b) => b.matchScore - a.matchScore);

    this.setData({ resultList: result, hasFilter: true });
  },

  clearFilters() {
    this.setData({
      selectedPetType: '',
      selectedPetTypeName: '',
      selectedPetSize: '',
      selectedPetSizeName: '',
      selectedPetAge: '',
      selectedPetAgeName: '',
      selectedCategory: '',
      selectedCategoryName: '',
      priceMin: '',
      priceMax: '',
      selectedTime: '',
      selectedTimeName: '',
      location: '',
      selectedSpecialNeeds: [],
      selectedSpecialNeedsNames: [],
      specialNeedsMap: {},
      customNeeds: '',
      moreFilterCount: 0,
      resultList: this.data.allServices,
      hasFilter: false,
    });
  },

  onSvcTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  goBack() {
    wx.navigateBack();
  },
});
