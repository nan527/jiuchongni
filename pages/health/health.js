// pages/health/health.js
const authService = require('../../services/authService');
const db = wx.cloud.database();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const TYPE_LABEL = {
  weight: '体重',
  vaccine: '疫苗',
  deworming: '驱虫',
  checkup: '体检',
  food: '饮食',
  note: '备注',
};

Page({
  data: {
    petList: [],
    selectedPetId: '',
    selectedPet: null,
    loading: true,
    // 状态数据
    latestWeight: '',
    weightTrend: '',
    lastVaccine: '',
    lastDeworming: '',
    // 提醒
    reminders: [],
    // 最近记录
    recentRecords: [],
    // AI
    aiSuggestion: '',
    // 图表数据
    weightChart: [],
    vaccineTimeline: [],
    dewormingTimeline: [],
    // 导航栏
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight || 20;
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
        8000
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
    // 所有权校验：只能查看自己宠物的健康记录
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
        8000
      );

      const records = res.data || [];

      // 提取体重数据
      const weightRecords = records.filter(r => r.type === 'weight');
      const latestWeight = weightRecords.length > 0 ? weightRecords[0].value : '';
      let weightTrend = '';
      if (weightRecords.length >= 2) {
        const diff = parseFloat(weightRecords[0].value) - parseFloat(weightRecords[1].value);
        if (diff > 0.05) weightTrend = 'up';
        else if (diff < -0.05) weightTrend = 'down';
      }

      // 提取最近疫苗/驱虫
      const vaccineRecords = records.filter(r => r.type === 'vaccine');
      const dewormingRecords = records.filter(r => r.type === 'deworming');
      const lastVaccine = vaccineRecords.length > 0 ? this._formatDate(vaccineRecords[0].record_date) : '';
      const lastDeworming = dewormingRecords.length > 0 ? this._formatDate(dewormingRecords[0].record_date) : '';

      // 生成提醒
      const reminders = this._buildReminders(vaccineRecords, dewormingRecords);

      // 最近记录（取前 8 条）
      const recentRecords = records.slice(0, 8).map(r => ({
        ...r,
        typeLabel: TYPE_LABEL[r.type] || r.type,
        displayValue: this._getDisplayValue(r),
        dateStr: this._formatDate(r.record_date),
        note: r.note || r.food_intake || '',
      }));

      // 处理体重趋势图数据
      const weightChart = this._buildWeightChart(weightRecords);

      // 处理疫苗时间线
      const vaccineTimeline = this._buildTimeline(vaccineRecords, 'vaccine');

      // 处理驱虫时间线
      const dewormingTimeline = this._buildTimeline(dewormingRecords, 'deworming');

      // AI 建议
      this.loadAiSuggestion(pet, weightRecords);

      this.setData({
        latestWeight,
        weightTrend,
        lastVaccine,
        lastDeworming,
        reminders,
        recentRecords,
        weightChart,
        vaccineTimeline,
        dewormingTimeline,
      });
    } catch (e) {
      console.warn('[Health] loadPetHealth', e);
    }
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

  async loadAiSuggestion(pet, weightRecords) {
    try {
      const aiRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'analyze_health',
          pet_info: pet,
          current_data: {
            weight: weightRecords.length > 0 ? weightRecords[0].value : '',
          },
        },
      });
      this.setData({ aiSuggestion: aiRes.result.suggestion || '' });
    } catch (e) {
      // AI 分析失败不阻断
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

    return records.map((r, i) => {
      const weight = weights[i];
      const heightPercent = ((weight - minWeight) / range) * 60 + 40;
      return {
        value: weight,
        date: this._formatDate(r.record_date),
        height: `${heightPercent}%`,
        isMax: weight === maxWeight && weights.length > 1,
        isMin: weight === minWeight && weights.length > 1,
      };
    });
  },

  _buildTimeline(records, type) {
    if (records.length === 0) return [];

    return records.slice(0, 5).map((r, i) => {
      const date = new Date(r.record_date);
      const name = type === 'vaccine'
        ? (r.vaccine_name || r.value || '疫苗接种')
        : (r.medicine_name || r.value || '驱虫');
      return {
        name,
        date: this._formatDate(r.record_date),
        year: date.getFullYear(),
        isFirst: i === 0,
        isLast: i === Math.min(records.length, 5) - 1,
        status: i === 0 ? '已完成' : '已完成',
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

  goToAddRecord(e) {
    const type = e.currentTarget.dataset.type || '';
    wx.navigateTo({ url: `/pages/health-add/health-add?petId=${this.data.selectedPetId}&type=${type}` });
  },

  goToAllRecords() {
    wx.navigateTo({ url: `/pages/health-stats/health_stats?petId=${this.data.selectedPetId}` });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  onGoBack() {
    wx.navigateBack();
  },
});
