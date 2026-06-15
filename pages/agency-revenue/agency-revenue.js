// pages/agency-revenue/agency-revenue.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const CAT_LABEL = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

const CAT_COLORS = ['#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548'];

const STATUS_COLOR = {
  pending: '#FFA726',
  confirmed: '#42A5F5',
  in_progress: '#66BB6A',
  to_confirm: '#FF7043',
  completed: '#26A69A',
  cancelled: '#EF5350',
};

const STATUS_LABEL = {
  pending: '待接单',
  confirmed: '已接单',
  in_progress: '服务中',
  to_confirm: '待确认',
  completed: '已完成',
  cancelled: '已取消',
};

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    totalRevenue: '0.00',
    monthRevenue: '0.00',
    totalOrders: 0,
    completedOrders: 0,
    avgPrice: '0.00',
    monthlyBars: [],
    statusLegend: [],
    categoryBars: [],
    dailyBars: [],
  },

  _orders: [],

  onGoBack() {
    wx.navigateBack();
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo || !userInfo.agencyProfileId) {
      wx.showToast({ title: '请先登录机构', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中...' });
    await this._loadOrders(userInfo.agencyProfileId);
    wx.hideLoading();
  },

  async _loadOrders(pid) {
    const db = wx.cloud.database();
    let list = [];
    try {
      const res = await db.collection('user_orders')
        .where({ orderType: 'agency', agencyProfileId: pid })
        .orderBy('createTime', 'desc')
        .limit(200)
        .get();
      list = res.data || [];
    } catch (e) {
      console.warn('[Revenue] load', e);
    }
    this._orders = list;
    this._calcStats();
    this._calcMonthlyBars();
    this._calcStatusDonut();
    this._calcCategoryBars();
    this._calcDailyBars();
  },

  /* ===== 汇总指标 ===== */
  _calcStats() {
    const orders = this._orders;
    const completed = orders.filter(o => o.orderStatus === 'completed');
    let total = 0;
    completed.forEach(o => { total += parseFloat(o.price) || 0; });

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let monthTotal = 0;
    completed.forEach(o => {
      const d = this._toDate(o.createTime);
      if (d && d.getFullYear() === y && d.getMonth() === m) {
        monthTotal += parseFloat(o.price) || 0;
      }
    });

    const avg = completed.length > 0 ? total / completed.length : 0;

    this.setData({
      totalRevenue: total.toFixed(2),
      monthRevenue: monthTotal.toFixed(2),
      totalOrders: orders.length,
      completedOrders: completed.length,
      avgPrice: avg.toFixed(2),
    });
  },

  /* ===== 月度营收柱状图 (最近6个月) ===== */
  _calcMonthlyBars() {
    const completed = this._orders.filter(o => o.orderStatus === 'completed');
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${d.getMonth() + 1}月`,
        value: 0,
      });
    }

    completed.forEach(o => {
      const d = this._toDate(o.createTime);
      if (!d) return;
      const match = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
      if (match) match.value += parseFloat(o.price) || 0;
    });

    const maxVal = Math.max(...months.map(m => m.value), 1);
    const bars = months.map(m => ({
      label: m.label,
      value: m.value.toFixed(0),
      percent: Math.round((m.value / maxVal) * 100),
    }));

    this.setData({ monthlyBars: bars });
  },

  /* ===== 订单状态环形图 ===== */
  _calcStatusDonut() {
    const orders = this._orders;
    const counts = {};
    orders.forEach(o => {
      const s = o.orderStatus || 'pending';
      counts[s] = (counts[s] || 0) + 1;
    });

    const legend = Object.keys(counts).map(key => ({
      label: STATUS_LABEL[key] || key,
      count: counts[key],
      color: STATUS_COLOR[key] || '#999',
    }));

    this.setData({ statusLegend: legend });

    // 绘制环形图
    setTimeout(() => this._drawDonut(legend, orders.length), 100);
  },

  _drawDonut(legend, total) {
    if (total === 0) return;
    const ctx = wx.createCanvasContext('donutCanvas', this);
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 80;
    const innerR = 50;

    let startAngle = -Math.PI / 2;
    legend.forEach(item => {
      const sliceAngle = (item.count / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      const endX = cx + innerR * Math.cos(startAngle + sliceAngle);
      const endY = cy + innerR * Math.sin(startAngle + sliceAngle);
      ctx.lineTo(endX, endY);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.setFillStyle(item.color);
      ctx.fill();
      startAngle += sliceAngle;
    });
    ctx.draw();
  },

  /* ===== 服务类型营收占比 ===== */
  _calcCategoryBars() {
    const completed = this._orders.filter(o => o.orderStatus === 'completed');
    const catMap = {};
    completed.forEach(o => {
      const cat = o.category || 'other';
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += parseFloat(o.price) || 0;
    });

    let totalCat = 0;
    Object.values(catMap).forEach(v => { totalCat += v; });

    const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const maxVal = entries.length > 0 ? entries[0][1] : 1;

    const bars = entries.map(([cat, val], idx) => ({
      label: CAT_LABEL[cat] || cat,
      value: val.toFixed(0),
      percent: Math.round((val / maxVal) * 100),
      ratio: totalCat > 0 ? Math.round((val / totalCat) * 100) : 0,
      color: CAT_COLORS[idx % CAT_COLORS.length],
    }));

    this.setData({ categoryBars: bars });
  },

  /* ===== 近7天订单量柱状图 ===== */
  _calcDailyBars() {
    const orders = this._orders;
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        year: d.getFullYear(),
        month: d.getMonth(),
        date: d.getDate(),
        count: 0,
      });
    }

    orders.forEach(o => {
      const d = this._toDate(o.createTime);
      if (!d) return;
      const match = days.find(day =>
        day.year === d.getFullYear() && day.month === d.getMonth() && day.date === d.getDate()
      );
      if (match) match.count++;
    });

    const maxCount = Math.max(...days.map(d => d.count), 1);
    const bars = days.map(d => ({
      label: d.dateStr,
      count: d.count,
      percent: Math.round((d.count / maxCount) * 100),
    }));

    this.setData({ dailyBars: bars });
  },

  /* ===== 工具 ===== */
  _toDate(t) {
    if (!t) return null;
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    return isNaN(d.getTime()) ? null : d;
  },
});
