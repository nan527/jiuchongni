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

      const aiRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'smart_match_parse',
          userText: this.data.userText,
          petInfo,
        },
      });

      const { success, parsed, msg } = aiRes.result || {};
      if (!success || !parsed) {
        wx.showToast({ title: msg || 'AI 解析失败', icon: 'none' });
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

      // 5. 硬性过滤
      let filtered = pairs;
      if (parsed.serviceCategory) {
        filtered = filtered.filter(({ service }) => service.category === parsed.serviceCategory);
      }

      // 6. 评分 + 排序
      const scored = filtered.map(p => ({
        ...p,
        matchScore: this._calcScore(p, parsed, userLocation),
      }));

      const results = scored
        .filter(r => r.matchScore >= 30)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      // 7. 补充机构图片、生成匹配理由
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

  // 评分算法
  _calcScore({ service, agency }, parsed, userLocation) {
    let score = 5;

    // 1. 服务类型匹配 (+25)
    if (parsed.serviceCategory && service.category === parsed.serviceCategory) {
      score += 25;
    }

    // 2. 关键词匹配 (+20)
    const textPool = [
      service.name, service.desc,
      agency.orgIntro, agency.serviceScope, agency.orgName
    ].join(' ').toLowerCase();
    const keywordHits = (parsed.keywords || []).filter(kw => textPool.includes(kw.toLowerCase()));
    score += Math.min(keywordHits.length * 5, 20);

    // 3. 价格匹配 (+15)
    if (parsed.budget && parsed.budget.max) {
      const price = Number(service.price) || 0;
      if (price >= (parsed.budget.min || 0) && price <= parsed.budget.max) {
        score += 15;
      } else if (parsed.budget.min && price < parsed.budget.min) {
        score += 10;
      }
    }

    // 5. 环境展示度 (+10)
    if (agency.envImages && agency.envImages.length > 0) {
      score += 10;
    } else {
      score += 3;
    }

    // 6. 偏好匹配 (+10)
    if (parsed.preferences && parsed.preferences.length > 0) {
      const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
        .filter(Boolean).join(' ').toLowerCase();
      const prefHits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
      score += Math.min(prefHits.length * 5, 10);
    }

    // 7. 紧急度加成 (+5)
    if (parsed.urgency === 'urgent' && service.category === 'foster' && agency.totalCages > 0) {
      score += 5;
    }

    return score;
  },

  // 生成匹配理由
  _generateReason({ service, agency, matchScore }, parsed) {
    const reasons = [];
    if (parsed.serviceCategory && service.category === parsed.serviceCategory) {
      reasons.push('服务类型完全匹配');
    }
    if (parsed.preferences && parsed.preferences.length > 0) {
      const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
        .filter(Boolean).join(' ').toLowerCase();
      const hits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
      if (hits.length > 0) reasons.push('满足' + hits.join('、') + '等偏好');
    }
    if (parsed.budget && parsed.budget.max) {
      const price = Number(service.price) || 0;
      if (price <= parsed.budget.max) reasons.push('价格在预算范围内');
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
