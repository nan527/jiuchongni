// pages/health/health.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');
const db = wx.cloud.database();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const TYPE_LABEL = {
  weight: '体重',
  temperature: '体温',
  vaccine: '疫苗',
  deworming: '驱虫',
  checkup: '体检',
  food: '饮食',
  note: '备注',
};

const RISK_RECOMMENDATIONS = {
  weight: { text: '体重变化异常，建议预约体检服务', category: 'medical', icon: 'medal-o' },
  vaccine: { text: '疫苗即将过期，建议尽快预约接种', category: 'medical', icon: 'shield-o' },
  deworming: { text: '驱虫周期已到，建议预约驱虫服务', category: 'medical', icon: 'good-job-o' },
  diet: { text: '饮食可能不均衡，建议咨询营养师', category: 'extra', icon: 'smile-o' },
  default: { text: '建议咨询专业宠物医生', category: 'medical', icon: 'shop-o' },
};

Page({
  data: {
    petList: [],
    selectedPetId: '',
    selectedPet: null,
    loading: true,
    // 状态数据
    latestWeight: '',
    prevWeight: '',
    weightTrend: '',
    lastVaccine: '',
    lastDeworming: '',
    vaccineCountdown: null,
    dewormingCountdown: null,
    // 提醒
    reminders: [],
    // 最近记录
    recentRecords: [],
    allRecords: [],
    filteredAllRecords: [],
    showAllRecordsPopup: false,
    allRecordsTypeFilter: 'all',
    allRecordsTimeFilter: 'all',
    // 时间轴
    vaccineTimelineAll: [],
    dewormingTimelineAll: [],
    showFullVaccine: false,
    showFullDeworming: false,
    showTimelineDetail: false,
    timelineDetail: null,
    // AI 风险预警
    riskAlerts: [],
    riskSummary: '',
    riskLoading: false,
    riskError: '',
    riskDate: '',
    recommendations: [],
    matchedServices: [],
    showHistoryPopup: false,
    historyRisks: [],
    hasUnsavedRisk: false,
    showHistoryDetail: false,
    historyDetail: null,
    // 图表数据
    weightChart: [],
    vaccineTimeline: [],
    dewormingTimeline: [],
    // 导航栏
    statusBarHeight: 0,
    navBarHeight: 0,
    // Tab
    activeTab: 'overview',
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'trends') {
      setTimeout(() => this._redrawChart(), 300);
    }
  },

  _redrawChart() {
    const { weightChart } = this.data;
    if (weightChart.length === 0) return;
    const weights = weightChart.map(p => p.value);
    const maxWeight = Math.max(...weights);
    const minWeight = Math.min(...weights);
    const range = maxWeight - minWeight || 1;
    this._drawWeightCurve(weightChart, minWeight, range);
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
    await this.loadPets();
  },

  async loadPets() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ petList: [], loading: false });
      return;
    }
    try {
      const res = await withTimeout(
        db.collection('pets').where({ ownerId: userId }).orderBy('createTime', 'desc').get(),
        15000
      );
      const petList = (res.data || []).filter(p => p.ownerId === userId);
      let selectedPetId = this.data.selectedPetId;

      if (petList.length > 0 && !petList.find(p => p._id === selectedPetId)) {
        selectedPetId = petList[0]._id;
      }

      this.setData({ petList, selectedPetId, loading: false });

      if (selectedPetId) {
        this.loadPetHealth(selectedPetId);
      }
    } catch (e) {
      console.warn('[Health] loadPets', e);
      this.setData({ loading: false });
    }
  },

  onSelectPet(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedPetId) return;
    this.setData({ selectedPetId: id });
    this.loadPetHealth(id);
  },

  async loadPetHealth(petId) {
    const pet = this.data.petList.find(p => p._id === petId);
    if (!pet || pet.ownerId !== this._userId) {
      this.setData({ selectedPet: null, recentRecords: [], healthLoading: false });
      return;
    }
    this.setData({ selectedPet: pet });

    try {
      const res = await withTimeout(
        db.collection('health_records')
          .where({ pet_id: petId })
          .orderBy('record_date', 'desc')
          .limit(50)
          .get(),
        15000
      );

      const records = res.data || [];

      // 提取体重数据
      const weightRecords = records.filter(r => r.type === 'weight');
      // 本次体重优先取宠物档案，上次体重取 health_records 最新记录
      const petWeight = pet.weight ? String(pet.weight) : '';
      const recordLatestWeight = weightRecords.length > 0 ? weightRecords[0].value : '';
      const latestWeight = petWeight || recordLatestWeight || '';
      const prevWeight = (petWeight && recordLatestWeight && petWeight !== recordLatestWeight)
        ? recordLatestWeight
        : (weightRecords.length > 1 ? weightRecords[1].value : '');
      let weightTrend = '';
      if (latestWeight && prevWeight) {
        const diff = parseFloat(latestWeight) - parseFloat(prevWeight);
        if (diff > 0.05) weightTrend = 'up';
        else if (diff < -0.05) weightTrend = 'down';
      }

      // 提取最近疫苗/驱虫
      const vaccineRecords = records.filter(r => r.type === 'vaccine');
      const dewormingRecords = records.filter(r => r.type === 'deworming');
      const lastVaccine = vaccineRecords.length > 0 ? this._formatDate(vaccineRecords[0].record_date) : '';
      const lastDeworming = dewormingRecords.length > 0 ? this._formatDate(dewormingRecords[0].record_date) : '';

      // 计算倒计时
      const vaccineCountdown = this._calcCountdown(vaccineRecords, 90);
      const dewormingCountdown = this._calcCountdown(dewormingRecords, 30);

      // 生成提醒
      const reminders = this._buildReminders(vaccineRecords, dewormingRecords);

      // 最近记录（取前 5 条）
      const iconMap = {
        weight: { name: 'chart-trending-o', color: '#FF9800' },
        vaccine: { name: 'shield-o', color: '#1565C0' },
        deworming: { name: 'good-job-o', color: '#2E7D32' },
        checkup: { name: 'notes-o', color: '#7B1FA2' },
        food: { name: 'food-o', color: '#F57F17' },
        note: { name: 'edit', color: '#999' },
      };
      const recentRecords = records.slice(0, 5).map(r => {
        const icon = iconMap[r.type] || { name: 'chart-trending-o', color: '#FF9800' };
        return {
          ...r,
          typeLabel: TYPE_LABEL[r.type] || r.type,
          displayValue: this._getDisplayValue(r),
          dateStr: this._formatDate(r.record_date),
          note: r.note || r.food_intake || '',
          iconName: icon.name,
          iconColor: icon.color,
        };
      });

      // 全部记录（用于弹窗筛选）
      const allRecords = records.map(r => {
        const iconMap = {
          weight: { name: 'chart-trending-o', color: '#FF9800' },
          vaccine: { name: 'shield-o', color: '#1565C0' },
          deworming: { name: 'good-job-o', color: '#2E7D32' },
          checkup: { name: 'notes-o', color: '#7B1FA2' },
          food: { name: 'food-o', color: '#F57F17' },
          note: { name: 'edit', color: '#999' },
        };
        const icon = iconMap[r.type] || { name: 'chart-trending-o', color: '#FF9800' };
        return {
          ...r,
          typeLabel: TYPE_LABEL[r.type] || r.type,
          displayValue: this._getDisplayValue(r),
          dateStr: this._formatDate(r.record_date),
          note: r.note || r.food_intake || '',
          iconName: icon.name,
          iconColor: icon.color,
        };
      });

      // 处理体重趋势图数据
      const weightChart = this._buildWeightChart(weightRecords);

      // 处理疫苗时间线（倒序：较新在上）
      const vaccineTimelineAll = this._buildTimeline(vaccineRecords, 'vaccine');
      const vaccineTimeline = vaccineTimelineAll.slice(0, 4);

      // 处理驱虫时间线（倒序：较新在上）
      const dewormingTimelineAll = this._buildTimeline(dewormingRecords, 'deworming');
      const dewormingTimeline = dewormingTimelineAll.slice(0, 4);

      // 加载已保存的风险预警记录
      this.loadSavedRisk(petId);

      this.setData({
        latestWeight,
        prevWeight,
        weightTrend,
        lastVaccine,
        lastDeworming,
        vaccineCountdown,
        dewormingCountdown,
        reminders,
        recentRecords,
        allRecords,
        weightChart,
        vaccineTimeline,
        vaccineTimelineAll,
        dewormingTimeline,
        dewormingTimelineAll,
        showFullVaccine: false,
        showFullDeworming: false,
        allRecordsTypeFilter: 'all',
        allRecordsTimeFilter: 'all',
        filteredAllRecords: allRecords,
      });
    } catch (e) {
      console.warn('[Health] loadPetHealth', e);
    }
  },

  _calcCountdown(records, intervalDays) {
    if (records.length === 0) return null;
    const latest = records[0];
    let nextDate;
    // 优先使用录入时填写的下次日期
    if (latest.next_date) {
      nextDate = new Date(latest.next_date);
    } else {
      const lastDate = new Date(latest.record_date);
      nextDate = new Date(lastDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }
    const daysLeft = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
    return { daysLeft, nextDate: this._formatDateFull(nextDate) };
  },

  _buildReminders(vaccineRecords, dewormingRecords) {
    const reminders = [];
    const now = new Date();

    // 疫苗提醒（3个月周期）
    if (vaccineRecords.length > 0) {
      const lastDate = new Date(vaccineRecords[0].record_date);
      const dueDate = new Date(lastDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 14) {
        reminders.push({
          title: daysLeft <= 0 ? '疫苗已过期，请尽快接种' : `疫苗即将到期（${daysLeft}天后）`,
          dueDateStr: this._formatDate(dueDate),
          isOverdue: daysLeft <= 0,
        });
      }
    }

    // 驱虫提醒（1个月周期）
    if (dewormingRecords.length > 0) {
      const lastDate = new Date(dewormingRecords[0].record_date);
      const dueDate = new Date(lastDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        reminders.push({
          title: daysLeft <= 0 ? '驱虫已过期，请尽快处理' : `驱虫即将到期（${daysLeft}天后）`,
          dueDateStr: this._formatDate(dueDate),
          isOverdue: daysLeft <= 0,
        });
      }
    }

    return reminders;
  },

  // 加载已保存的风险预警记录
  async loadSavedRisk(petId) {
    try {
      const res = await withTimeout(
        db.collection('health_risk_records')
          .where({ petId })
          .orderBy('analyzeTime', 'desc')
          .limit(1)
          .get(),
        15000
      );
      if (res.data && res.data.length > 0) {
        const saved = res.data[0];
        const risks = saved.risks || [];
        const recommendations = saved.recommendations || this._buildRecommendations(risks);
        const matchedServices = await this._loadMatchedServices(risks);
        this.setData({
          riskAlerts: risks,
          riskSummary: saved.summary || '',
          riskDate: saved.analyzeTime || '',
          riskError: '',
          recommendations,
          matchedServices,
          hasUnsavedRisk: false,
        });
      }
    } catch (e) {
      // 无记录不影响页面
    }
  },

  // 手动执行风险分析
  async runRiskAnalysis() {
    const pet = this.data.selectedPet;
    if (!pet) return;

    this.setData({ riskLoading: true, riskError: '' });

    let records = [];
    try {
      const res = await withTimeout(
        db.collection('health_records')
          .where({ pet_id: pet._id })
          .orderBy('record_date', 'desc')
          .limit(30)
          .get(),
        15000
      );
      records = res.data || [];
    } catch (e) {
      console.error('[Health] 查询健康记录失败:', e);
      this.setData({ riskLoading: false, riskError: '加载健康记录失败，请检查网络后重试' });
      return;
    }

    let aiRes;
    try {
      aiRes = await withTimeout(
        wx.cloud.callFunction({
          name: 'ai_handler',
          data: {
            action: 'health_risk_analysis',
            pet_info: { name: pet.name, species: pet.species, age: pet.age, breed: pet.breed, weight: pet.weight },
            health_records: records.map(r => ({
              type: r.type,
              value: r.value || r.vaccine_name || r.medicine_name || r.result || '',
              createTime: r.record_date || r.createTime || '',
            })),
          },
        }),
        60000
      );
    } catch (e) {
      console.error('[Health] AI 云函数调用失败:', e);
      const msg = e.message === 'timeout' ? '分析超时，请稍后重试' : 'AI 分析服务暂时不可用，请稍后重试';
      this.setData({ riskLoading: false, riskError: msg });
      return;
    }

    // 检查云函数返回的错误
    if (aiRes.result && aiRes.result.success === false && !aiRes.result.risks) {
      console.error('[Health] 云函数返回错误:', aiRes.result.msg);
      this.setData({ riskLoading: false, riskError: aiRes.result.msg || 'AI 分析失败，请稍后重试' });
      return;
    }

    const { risks = [], summary = '' } = aiRes.result || {};

    try {
      const recommendations = this._buildRecommendations(risks);
      const matchedServices = await this._loadMatchedServices(risks);

      this.setData({
        riskAlerts: risks,
        riskSummary: summary,
        riskLoading: false,
        riskDate: new Date().toISOString().slice(0, 16).replace('T', ' '),
        riskError: '',
        recommendations,
        matchedServices,
        hasUnsavedRisk: true,
      });
    } catch (e) {
      console.error('[Health] 处理分析结果失败:', e);
      this.setData({ riskLoading: false, riskError: '分析结果处理失败，请重试' });
      return;
    }
  },

  _buildRecommendations(risks) {
    if (!risks || risks.length === 0) return [];
    const recs = [];
    const seen = new Set();
    for (const risk of risks) {
      const type = this._detectRiskType(risk.title);
      if (seen.has(type)) continue;
      seen.add(type);
      const cfg = RISK_RECOMMENDATIONS[type] || RISK_RECOMMENDATIONS.default;
      recs.push({ type, ...cfg });
    }
    return recs;
  },

  _detectRiskType(title) {
    if (!title) return 'default';
    const t = title.toLowerCase();
    if (t.includes('体重')) return 'weight';
    if (t.includes('疫苗') || t.includes('免疫')) return 'vaccine';
    if (t.includes('驱虫')) return 'deworming';
    if (t.includes('饮食') || t.includes('营养')) return 'diet';
    return 'default';
  },

  async _loadMatchedServices(risks) {
    if (!risks || risks.length === 0) return [];
    const type = this._detectRiskType(risks[0].title);

    // 每种风险类型的匹配规则：关键词(加分)、排除词(直接过滤)、推荐原因
    const RULES = {
      weight: {
        keywords: { '体检': 10, '检查': 8, '诊疗': 7, '全科': 6, '门诊': 6, '健康': 5, '体重': 8, '医疗': 4, '内科': 5 },
        exclude: ['绝育', '美容', '洁牙', '洗牙', '寄养', '上门', '洗澡', '造型', '修剪', '染色'],
        reason: '体重变化需排查原因，建议做全面体检',
      },
      vaccine: {
        keywords: { '疫苗': 10, '接种': 8, '免疫': 8, '狂犬': 7, '猫三联': 7, '驱虫': 2 },
        exclude: ['绝育', '美容', '洁牙', '寄养', '上门', '洗澡', '造型'],
        reason: '疫苗即将到期，建议预约接种服务',
      },
      deworming: {
        keywords: { '驱虫': 10, '体内': 6, '体外': 6, '寄生虫': 8 },
        exclude: ['绝育', '美容', '洁牙', '寄养', '上门', '洗澡', '造型'],
        reason: '驱虫周期已到，建议预约驱虫服务',
      },
      diet: {
        keywords: { '营养': 8, '饮食': 8, '食品': 6, '配餐': 6, '减肥': 8, '体重管理': 8, '咨询': 4 },
        exclude: ['绝育', '美容', '洁牙', '寄养', '上门', '洗澡'],
        reason: '饮食可能不均衡，建议咨询营养师',
      },
      default: {
        keywords: { '体检': 8, '检查': 6, '健康': 5, '诊疗': 4 },
        exclude: ['绝育', '美容', '洁牙', '寄养'],
        reason: '建议做一次全面健康检查',
      },
    };
    const rule = RULES[type] || RULES.default;

    try {
      // 查询所有服务（不过滤 category，因为相关服务可能在不同分类下）
      const { data: services } = await withTimeout(
        db.collection('agency_services').limit(50).get(),
        15000
      );

      // 评分 + 过滤
      const scored = [];
      for (const s of services) {
        const name = (s.name || '').toLowerCase();
        const desc = (s.desc || '').toLowerCase();
        const text = name + desc;

        // 排除不相关的服务
        if (rule.exclude.some(k => text.includes(k))) continue;

        // 计算相关性得分
        let score = 0;
        let matchedKeyword = '';
        for (const [kw, pts] of Object.entries(rule.keywords)) {
          if (text.includes(kw)) {
            score += pts;
            if (!matchedKeyword || pts > rule.keywords[matchedKeyword]) {
              matchedKeyword = kw;
            }
          }
        }

        // 没匹配到任何关键词的服务跳过
        if (score === 0) continue;

        scored.push({ ...s, _score: score, _matchedKeyword: matchedKeyword });
      }

      // 按得分降序，取前 3
      scored.sort((a, b) => b._score - a._score);
      const top3 = scored.slice(0, 3);

      if (top3.length === 0) return [];

      // 并行查询机构名称
      const agencyIds = [...new Set(top3.map(s => s.agencyProfileId).filter(Boolean))];
      const agencyMap = {};
      await Promise.all(agencyIds.map(async (id) => {
        try {
          const res = await withTimeout(
            db.collection('agency_profiles').doc(id).get(),
            15000
          );
          agencyMap[id] = res.data.orgName || res.data.name || '';
        } catch (e) { /* ignore */ }
      }));

      return top3.map(s => ({
        _id: s._id,
        name: s.name,
        price: s.price,
        unit: s.unit || '',
        agencyName: agencyMap[s.agencyProfileId] || '',
        desc: s.desc || '',
        reason: rule.reason,
      }));
    } catch (e) {
      console.warn('[Health] _loadMatchedServices', e);
      return [];
    }
  },

  // 用户主动保存当前预警
  async saveCurrentRisk() {
    const pet = this.data.selectedPet;
    const risks = this.data.riskAlerts;
    const summary = this.data.riskSummary;
    if (!pet || risks.length === 0) return;
    await this.saveRiskToDB(pet._id, risks, summary);
  },

  // 保存风险记录到数据库
  async saveRiskToDB(petId, risks, summary) {
    if (!petId) {
      console.warn('[Health] saveRiskToDB: petId 为空');
      wx.showToast({ title: '宠物信息缺失，保存失败', icon: 'none' });
      return;
    }
    if (!this._userId) {
      console.warn('[Health] saveRiskToDB: _userId 为空');
      wx.showToast({ title: '用户信息缺失，保存失败', icon: 'none' });
      return;
    }
    try {
      const recommendations = this._buildRecommendations(risks);
      const matchedServices = await this._loadMatchedServices(risks);
      const doc = {
        petId,
        ownerId: this._userId,
        risks: risks || [],
        summary: summary || '',
        recommendations,
        matchedServices,
        analyzeTime: new Date().toISOString(),
        createTime: db.serverDate(),
      };
      console.log('[Health] saveRiskToDB 准备保存:', doc);
      const res = await withTimeout(
        db.collection('health_risk_records').add({ data: doc }),
        15000
      );
      console.log('[Health] saveRiskToDB 保存成功:', res._id);
      this.setData({ hasUnsavedRisk: false });
      wx.showToast({ title: '预警记录已保存', icon: 'success' });
    } catch (e) {
      console.error('[Health] saveRiskToDB 保存失败:', e);
      wx.showToast({ title: '保存失败：' + (e.message || '未知错误'), icon: 'none' });
    }
  },

  _getDisplayValue(record) {
    switch (record.type) {
      case 'weight':
        return `${record.value}kg`;
      case 'vaccine':
        return record.vaccine_name || record.value || '疫苗接种';
      case 'deworming':
        return record.medicine_name || record.value || '驱虫';
      case 'checkup':
        return record.result || '体检';
      case 'food':
        return record.food_intake || record.value || '饮食记录';
      case 'note':
        return record.value || record.note || '备注';
      default:
        return record.value || '';
    }
  },

  _buildWeightChart(weightRecords) {
    if (weightRecords.length === 0) return [];

    // 取最近 7 条体重记录
    const records = weightRecords.slice(0, 7).reverse();
    const weights = records.map(r => parseFloat(r.value) || 0);
    const maxWeight = Math.max(...weights);
    const minWeight = Math.min(...weights);
    const range = maxWeight - minWeight || 1;

    const points = records.map((r, i) => ({
      value: weights[i],
      date: this._formatDate(r.record_date),
      isMax: weights[i] === maxWeight && weights.length > 1,
      isMin: weights[i] === minWeight && weights.length > 1,
    }));

    // 延迟绘制 canvas
    setTimeout(() => this._drawWeightCurve(points, minWeight, range), 300);

    return points;
  },

  _drawWeightCurve(points, minWeight, range) {
    if (!points || points.length === 0) return;
    const query = wx.createSelectorQuery();
    query.select('#weightCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio || 2;
        const width = res[0].width;
        const height = res[0].height;

        // 如果尺寸为 0，延迟重试
        if (width === 0 || height === 0) {
          setTimeout(() => this._drawWeightCurve(points, minWeight, range), 200);
          return;
        }

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        const padLeft = 28;
        const padRight = 28;
        const padTop = 36;
        const padBottom = 48;
        const chartW = width - padLeft - padRight;
        const chartH = height - padTop - padBottom;

        // 计算数据点坐标
        const coords = points.length === 1
          ? [{ x: padLeft + chartW / 2, y: padTop + chartH - ((points[0].value - minWeight) / range) * chartH }]
          : points.map((p, i) => ({
              x: padLeft + (i / (points.length - 1)) * chartW,
              y: padTop + chartH - ((p.value - minWeight) / range) * chartH,
            }));

        // 绘制网格线（3条水平虚线）
        ctx.strokeStyle = '#F0E6D8';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 4]);
        for (let g = 0; g <= 2; g++) {
          const gy = padTop + (chartH / 2) * g;
          ctx.beginPath();
          ctx.moveTo(padLeft, gy);
          ctx.lineTo(width - padRight, gy);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // 绘制渐变填充区域（需要至少2个点）
        if (coords.length >= 2) {
          const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
          gradient.addColorStop(0, 'rgba(255, 152, 0, 0.25)');
          gradient.addColorStop(1, 'rgba(255, 152, 0, 0.02)');

          ctx.beginPath();
          ctx.moveTo(coords[0].x, padTop + chartH);
          ctx.lineTo(coords[0].x, coords[0].y);

          // 平滑贝塞尔曲线
          for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const cpx = (prev.x + curr.x) / 2;
            ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
          }

          ctx.lineTo(coords[coords.length - 1].x, padTop + chartH);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          // 绘制曲线
          ctx.beginPath();
          ctx.moveTo(coords[0].x, coords[0].y);
          for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const cpx = (prev.x + curr.x) / 2;
            ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
          }
          ctx.strokeStyle = '#FF9800';
          ctx.lineWidth = 2.5;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // 绘制数据点
        coords.forEach((c, i) => {
          const p = points[i];
          ctx.beginPath();
          ctx.arc(c.x, c.y, p.isMax || p.isMin ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = p.isMax ? '#E64A19' : p.isMin ? '#4CAF50' : '#FF9800';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        // 绘制日期标签
        ctx.fillStyle = '#A89585';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        coords.forEach((c, i) => {
          ctx.fillText(points[i].date, c.x, height - 10);
        });

        // 绘制数值标签
        ctx.fillStyle = '#3D2C1E';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        coords.forEach((c, i) => {
          const label = String(points[i].value);
          ctx.fillText(label, c.x, c.y - 10);
        });
      });
  },

  _buildTimeline(records, type) {
    if (records.length === 0) return [];

    return records.map((r) => {
      const date = new Date(r.record_date);
      const name = type === 'vaccine'
        ? (r.vaccine_name || r.value || '疫苗接种')
        : (r.medicine_name || r.value || '驱虫');
      return {
        _id: r._id,
        name,
        date: this._formatDateFull(r.record_date),
        year: date.getFullYear(),
        status: '已完成',
        note: r.note || '',
        institution: r.institution || '',
        nextDate: r.next_date ? this._formatDateFull(r.next_date) : '',
        images: r.images || [],
        value: r.value || '',
      };
    });
  },

  _formatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  },

  _formatDateFull(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${m}-${day}`;
  },

  goToAddRecord(e) {
    const type = e.currentTarget.dataset.type || '';
    wx.navigateTo({ url: `/pages/health-add/health-add?petId=${this.data.selectedPetId}&type=${type}` });
  },

  // 全部记录弹窗
  goToAllRecords() {
    this.setData({ showAllRecordsPopup: true });
  },

  closeAllRecordsPopup() {
    this.setData({ showAllRecordsPopup: false });
  },

  onAllRecordsTypeFilter(e) {
    const typeFilter = e.currentTarget.dataset.type;
    this.setData({ allRecordsTypeFilter: typeFilter }, () => this.applyAllRecordsFilters());
  },

  onAllRecordsTimeFilter(e) {
    const timeFilter = e.currentTarget.dataset.time;
    this.setData({ allRecordsTimeFilter: timeFilter }, () => this.applyAllRecordsFilters());
  },

  applyAllRecordsFilters() {
    const { allRecords, allRecordsTypeFilter, allRecordsTimeFilter } = this.data;
    let list = [...allRecords];

    if (allRecordsTypeFilter !== 'all') {
      list = list.filter(r => r.type === allRecordsTypeFilter);
    }

    if (allRecordsTimeFilter !== 'all') {
      const now = new Date();
      if (allRecordsTimeFilter === 'week') {
        const weekStart = new Date(now.getTime() - (now.getDay() || 7) * 86400000);
        weekStart.setHours(0, 0, 0, 0);
        list = list.filter(r => new Date(r.record_date).getTime() >= weekStart.getTime());
      } else if (allRecordsTimeFilter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        list = list.filter(r => new Date(r.record_date).getTime() >= monthStart.getTime());
      }
    }

    this.setData({ filteredAllRecords: list });
  },

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条记录吗？',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          await withTimeout(
            db.collection('health_records').doc(id).remove(),
            8000
          );
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          // 重新加载数据
          this.loadPetHealth(this.data.selectedPetId);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  // 时间轴展开/收起
  toggleVaccineTimeline() {
    const { showFullVaccine, vaccineTimelineAll } = this.data;
    this.setData({
      showFullVaccine: !showFullVaccine,
      vaccineTimeline: !showFullVaccine ? vaccineTimelineAll : vaccineTimelineAll.slice(0, 4),
    });
  },

  toggleDewormingTimeline() {
    const { showFullDeworming, dewormingTimelineAll } = this.data;
    this.setData({
      showFullDeworming: !showFullDeworming,
      dewormingTimeline: !showFullDeworming ? dewormingTimelineAll : dewormingTimelineAll.slice(0, 4),
    });
  },

  onTimelineTap(e) {
    const { index, type } = e.currentTarget.dataset;
    const list = type === 'vaccine' ? this.data.vaccineTimeline : this.data.dewormingTimeline;
    const item = list[index];
    if (!item) return;
    this.setData({ timelineDetail: item, showTimelineDetail: true });
  },

  closeTimelineDetail() {
    this.setData({ showTimelineDetail: false });
  },

  previewImage(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  goToServices(e) {
    const category = e.currentTarget.dataset.category || '';
    wx.navigateTo({ url: `/pages/browse-agencies/browse-agencies?category=${category}` });
  },

  goToServiceDetail(e) {
    const serviceId = e.currentTarget.dataset.id;
    if (serviceId) {
      wx.navigateTo({ url: `/pages/service-detail/service-detail?serviceId=${serviceId}` });
    }
  },

  async openRiskHistory() {
    this.setData({ showHistoryPopup: true });
    await this.loadRiskHistory();
  },

  closeRiskHistory() {
    this.setData({ showHistoryPopup: false });
  },

  onHistoryTap(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.historyRisks[index];
    if (!item) return;
    this.setData({
      historyDetail: item,
      showHistoryDetail: true,
    });
  },

  closeHistoryDetail() {
    this.setData({ showHistoryDetail: false, historyDetail: null });
  },

  async onDeleteHistory(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.historyRisks[index];
    if (!item) return;

    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      confirmColor: '#E53935',
    });
    if (!res.confirm) return;

    try {
      await withTimeout(
        db.collection('health_risk_records').doc(item._id).remove(),
        15000
      );
      const historyRisks = this.data.historyRisks.filter((_, i) => i !== index);
      this.setData({ historyRisks });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      console.error('[Health] 删除预警记录失败:', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  async loadRiskHistory() {
    const pet = this.data.selectedPet;
    if (!pet) {
      console.warn('[Health] loadRiskHistory: 未选中宠物');
      return;
    }
    console.log('[Health] loadRiskHistory 查询 petId:', pet._id);
    try {
      const { data: list } = await withTimeout(
        db.collection('health_risk_records')
          .where({ petId: pet._id })
          .orderBy('analyzeTime', 'desc')
          .limit(20)
          .get(),
        15000
      );
      console.log('[Health] loadRiskHistory 查询结果条数:', list.length);
      const levelOrder = { high: 5, warning: 4, medium: 3, info: 2, low: 1 };
      const historyRisks = list.map(item => {
        const risks = item.risks || [];
        let maxLevel = '';
        let maxOrder = 0;
        risks.forEach(r => {
          const order = levelOrder[r.level] || 0;
          if (order > maxOrder) {
            maxOrder = order;
            maxLevel = r.level;
          }
        });
        return {
          ...item,
          dateStr: item.analyzeTime ? item.analyzeTime.slice(0, 16).replace('T', ' ') : '',
          riskCount: risks.length,
          maxLevel,
        };
      });
      this.setData({ historyRisks });
    } catch (e) {
      console.error('[Health] loadRiskHistory 查询失败:', e);
      wx.showToast({ title: '加载历史失败', icon: 'none' });
    }
  },

  onGoBack() {
    wx.navigateBack();
  },
});
