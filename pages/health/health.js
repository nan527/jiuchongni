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
    // AI 风险预警
    riskAlerts: [],
    riskSummary: '',
    riskLoading: false,
    riskError: '',
    riskDate: '',
    // 图表数据
    weightChart: [],
    vaccineTimeline: [],
    dewormingTimeline: [],
    // 导航栏
    statusBarHeight: 0,
    navBarHeight: 0,
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

      // 加载已保存的风险预警记录
      this.loadSavedRisk(petId);

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

  // 加载已保存的风险预警记录
  async loadSavedRisk(petId) {
    try {
      const res = await db.collection('health_risk_records')
        .where({ petId })
        .orderBy('analyzeTime', 'desc')
        .limit(1)
        .get();
      if (res.data && res.data.length > 0) {
        const saved = res.data[0];
        this.setData({
          riskAlerts: saved.risks || [],
          riskSummary: saved.summary || '',
          riskDate: saved.analyzeTime || '',
          riskError: '',
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

    try {
      // 获取健康记录
      const res = await withTimeout(
        db.collection('health_records')
          .where({ pet_id: pet._id })
          .orderBy('record_date', 'desc')
          .limit(30)
          .get(),
        8000
      );
      const records = res.data || [];

      // 调用 AI 分析
      const aiRes = await wx.cloud.callFunction({
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
      });

      const { risks = [], summary = '' } = aiRes.result || {};

      this.setData({
        riskAlerts: risks,
        riskSummary: summary,
        riskLoading: false,
        riskDate: new Date().toISOString().slice(0, 16).replace('T', ' '),
        riskError: '',
      });

      // 保存到数据库
      this.saveRiskToDB(pet._id, risks, summary);
    } catch (e) {
      console.warn('[Health] runRiskAnalysis', e);
      this.setData({ riskLoading: false, riskError: '分析失败，请重试' });
    }
  },

  // 保存风险记录到数据库
  async saveRiskToDB(petId, risks, summary) {
    try {
      // 删除该宠物旧的风险记录
      const old = await db.collection('health_risk_records').where({ petId }).get();
      for (const doc of old.data || []) {
        await db.collection('health_risk_records').doc(doc._id).remove();
      }
      // 插入新记录
      await db.collection('health_risk_records').add({
        data: {
          petId,
          ownerId: this._userId,
          risks,
          summary,
          analyzeTime: new Date().toISOString(),
          createTime: db.serverDate(),
        },
      });
    } catch (e) {
      console.warn('[Health] saveRiskToDB', e);
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

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        const padLeft = 8;
        const padRight = 8;
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
