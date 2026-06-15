// pages/smart-match/smart-match.js
const { CAT_TITLE_MAP, getStatusBarHeight } = require('../../utils/helpers');
const { resolveTempUrls } = require('../../utils/fileHelper');
const authService = require('../../services/authService');

const db = wx.cloud.database();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,

    // 宠物选择
    petList: [],
    selectedPetId: '',
    selectedPet: null,
    petPickerVisible: false,

    // 需求输入
    userText: '',
    placeholder: '例如：我家猫咪比较胆小，需要安静的环境，有24小时监控',

    // 结果
    resultList: [],
    aiReasons: {},       // { [serviceId]: '匹配理由' }
    parsedIntent: null,  // AI 解析结果
    loading: false,
    hasResult: false,
    resultCount: 0,
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = menuBtn.top + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    if (this.data.petList.length === 0) {
      await this.loadPets();
    }
  },

  async loadPets() {
    const userId = this._userId;
    if (!userId) return;
    try {
      const res = await withTimeout(
        db.collection('pets').where({ ownerId: userId }).orderBy('createTime', 'desc').get(),
        8000
      );
      const petList = (res.data || []).filter(p => p.ownerId === userId);
      let selectedPetId = this.data.selectedPetId;
      if (petList.length > 0 && !petList.find(p => p._id === selectedPetId)) {
        selectedPetId = petList[0]._id;
      }
      const selectedPet = petList.find(p => p._id === selectedPetId) || null;
      this.setData({ petList, selectedPetId, selectedPet });
    } catch (e) {
      console.warn('[SmartMatch] loadPets', e);
    }
  },

  // 宠物选择
  onShowPetPicker() {
    this.setData({ petPickerVisible: true });
  },

  onPetPickerClose() {
    this.setData({ petPickerVisible: false });
  },

  onPetSelect(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.petList.find(p => p._id === id);
    this.setData({ selectedPetId: id, selectedPet: pet, petPickerVisible: false });
  },

  // 需求输入
  onTextInput(e) {
    this.setData({ userText: e.detail.value });
  },

  onFillExample() {
    this.setData({ userText: '附近可以寄养猫咪的地方，价格实惠一点' });
  },

  // 核心：触发智能匹配
  async onMatchTap() {
    if (this.data.loading) return;
    if (!this.data.selectedPet) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }

    this.setData({ loading: true, resultList: [], hasResult: false });

    try {
      // 1. 调用 AI 解析需求
      const pet = this.data.selectedPet;
      const petInfo = {
        name: pet.name || '',
        species: pet.species || '',
        age: pet.age || '',
        breed: pet.breed || '',
      };

      let aiRes;
      try {
        aiRes = await wx.cloud.callFunction({
          name: 'ai_handler',
          data: {
            action: 'smart_match_parse',
            userText: this.data.userText,
            petInfo,
          },
        });
      } catch (cloudErr) {
        console.error('[SmartMatch] 云函数调用异常:', cloudErr);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const { success, parsed, msg } = aiRes.result || {};
      console.log('[SmartMatch] AI parsed:', JSON.stringify(parsed), 'success:', success, 'msg:', msg);
      if (!success || !parsed) {
        wx.showToast({ title: msg || 'AI 解析失败，请检查 AI 模型配置', icon: 'none', duration: 3000 });
        this.setData({ loading: false });
        return;
      }

      // 2. 获取用户位置
      let userLocation = null;
      try {
        const loc = await wx.getLocation({ type: 'gcj02' });
        userLocation = { latitude: loc.latitude, longitude: loc.longitude };
      } catch (e) {
        // 定位失败不阻断
      }

      // 3. 查询所有已审核机构及其服务
      const [agenciesRes, servicesRes] = await Promise.all([
        withTimeout(
          db.collection('agency_profiles').where({ auditStatus: 'approved' }).get(),
          8000
        ),
        withTimeout(
          db.collection('agency_services').orderBy('createTime', 'desc').limit(100).get(),
          8000
        ),
      ]);

      // 4. 构建 (agency, service) 对
      const agencies = agenciesRes.data || [];
      const services = servicesRes.data || [];
      const pairs = services.map(s => {
        const agency = agencies.find(a => a._id === s.agencyProfileId);
        return { service: s, agency };
      }).filter(p => p.agency);

      // 5. 硬性过滤（不满足直接排除）
      let filtered = pairs;

      // 服务类型筛选
      if (parsed.serviceCategory) {
        filtered = filtered.filter(({ service }) => service.category === parsed.serviceCategory);
      }

      // 地域筛选：用户指定了城市时，只保留该城市的机构
      if (parsed.location) {
        filtered = filtered.filter(({ agency }) => this._isLocationMatch(parsed.location, agency.region));
      }

      // 预算上限筛选：用户指定了预算上限时，排除超预算服务
      if (parsed.budget && parsed.budget.max) {
        filtered = filtered.filter(({ service }) => {
          const price = Number(service.price) || 0;
          return price <= parsed.budget.max;
        });
      }

      // 6. 软性评分 + 排序（仅对通过硬性筛选的结果评分）
      const scored = filtered.map(p => ({
        ...p,
        matchScore: this._calcScore(p, parsed, userLocation),
      }));

      const results = scored
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      // 7. 转换为百分比（满分 85）
      const MAX_SCORE = 85;
      for (const r of results) {
        r.matchPercent = Math.min(Math.round(r.matchScore / MAX_SCORE * 100), 100);
      }

      // 8. 补充机构图片、生成匹配理由
      // Batch resolve cover images
      const allFileIDs = results
        .filter(r => r.service.images && r.service.images.length)
        .map(r => r.service.images[0]);
      const resolvedUrls = allFileIDs.length > 0 ? await resolveTempUrls(allFileIDs) : [];
      let urlIdx = 0;
      const aiReasons = {};
      for (const r of results) {
        r.service.catTitle = CAT_TITLE_MAP[r.service.category] || '服务';
        if (r.service.images && r.service.images.length) {
          r.service.coverImage = resolvedUrls[urlIdx++] || '';
        }
        aiReasons[r.service._id] = this._generateReason(r, parsed);
      }

      this.setData({
        resultList: results,
        aiReasons,
        parsedIntent: parsed,
        loading: false,
        hasResult: true,
        resultCount: results.length,
      });
    } catch (e) {
      console.warn('[SmartMatch] onMatchTap', e);
      wx.showToast({ title: '匹配失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 评分算法（仅软性维度，硬性筛选已在外部完成）
  _calcScore({ service, agency }, parsed, userLocation) {
    let score = 10; // 通过硬性筛选的基础分

    // 1. 关键词匹配 (+30)
    const textPool = [
      service.name, service.desc,
      agency.orgIntro, agency.serviceScope, agency.orgName
    ].join(' ').toLowerCase();
    const keywordHits = (parsed.keywords || []).filter(kw => textPool.includes(kw.toLowerCase()));
    score += Math.min(keywordHits.length * 8, 30);

    // 2. 偏好匹配 (+25)
    if (parsed.preferences && parsed.preferences.length > 0) {
      const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
        .filter(Boolean).join(' ').toLowerCase();
      const prefHits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
      score += Math.min(prefHits.length * 10, 25);
    }

    // 3. 环境展示度 (+15)
    if (agency.envImages && agency.envImages.length > 0) {
      score += 15;
    } else {
      score += 3;
    }

    // 4. 紧急度加成 (+5)
    if (parsed.urgency === 'urgent' && service.category === 'foster' && agency.totalCages > 0) {
      score += 5;
    }

    return score;
  },

  // 地域匹配（硬性筛选）
  _isLocationMatch(userLocation, agencyRegion) {
    if (!userLocation || !agencyRegion) return true;
    const loc = userLocation.toLowerCase();
    const region = agencyRegion.toLowerCase();

    const strip = s => s.replace(/[省市自治区特别行政区壮族自治区回族自治区维吾尔自治区自治区]/g, '');
    const locClean = strip(loc);
    const regionClean = strip(region);

    // 直接匹配：机构区域包含用户城市
    if (regionClean.includes(locClean) || locClean.includes(regionClean)) {
      return true;
    }

    // 省份→城市匹配（如用户说"黑龙江"，机构在"哈尔滨"）
    const provinceCity = {
      '北京': ['北京'], '天津': ['天津'], '上海': ['上海'], '重庆': ['重庆'],
      '河北': ['石家庄', '唐山', '保定', '邯郸'], '山西': ['太原', '大同', '临汾'],
      '辽宁': ['沈阳', '大连', '鞍山'], '吉林': ['长春', '吉林'],
      '黑龙江': ['哈尔滨', '齐齐哈尔', '大庆', '牡丹江'],
      '江苏': ['南京', '苏州', '无锡', '常州'], '浙江': ['杭州', '宁波', '温州'],
      '安徽': ['合肥', '芜湖', '马鞍山'], '福建': ['福州', '厦门', '泉州'],
      '江西': ['南昌', '赣州', '九江'], '山东': ['济南', '青岛', '烟台'],
      '河南': ['郑州', '洛阳', '开封'], '湖北': ['武汉', '宜昌', '襄阳'],
      '湖南': ['长沙', '株洲', '湘潭'], '广东': ['广州', '深圳', '东莞', '佛山'],
      '海南': ['海口', '三亚'], '四川': ['成都', '绵阳', '德阳'],
      '贵州': ['贵阳', '遵义'], '云南': ['昆明', '大理', '丽江'],
      '陕西': ['西安', '咸阳', '宝鸡'], '甘肃': ['兰州', '天水'],
      '青海': ['西宁'], '台湾': ['台北', '高雄'],
      '内蒙古': ['呼和浩特', '包头'], '广西': ['南宁', '柳州', '桂林'],
      '西藏': ['拉萨'], '宁夏': ['银川'], '新疆': ['乌鲁木齐', '伊宁'],
    };

    // 用户说省份 → 机构城市在该省
    const cities = provinceCity[locClean];
    if (cities && cities.some(c => regionClean.includes(c))) return true;

    // 用户说城市 → 机构省份名在该城市所属省
    for (const [prov, cityList] of Object.entries(provinceCity)) {
      if (cityList.includes(locClean) && regionClean.includes(prov)) return true;
    }

    return false;
  },

  // 生成匹配理由
  _generateReason({ service, agency, matchScore }, parsed) {
    const reasons = [];
    // 硬性筛选理由
    if (parsed.location && agency.region) {
      reasons.push('位于' + parsed.location);
    }
    if (parsed.budget && parsed.budget.max) {
      reasons.push('价格在预算范围内');
    }
    // 软性评分理由
    if (parsed.preferences && parsed.preferences.length > 0) {
      const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
        .filter(Boolean).join(' ').toLowerCase();
      const hits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
      if (hits.length > 0) reasons.push('满足' + hits.join('、') + '等偏好');
    }
    if (reasons.length === 0) reasons.push('综合评分较高');
    return reasons.slice(0, 2).join('，');
  },

  // 操作跳转
  onDetailTap(e) {
    const agencyId = e.currentTarget.dataset.agencyid;
    if (agencyId) {
      wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
    }
  },

  onBookTap(e) {
    const serviceId = e.currentTarget.dataset.serviceid;
    if (serviceId) {
      wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${serviceId}` });
    }
  },

  onReMatch() {
    this.setData({ resultList: [], hasResult: false, parsedIntent: null });
  },

  goBack() {
    wx.navigateBack();
  },
});
