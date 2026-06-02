// pages/agency-reviews/agency-reviews.js
const authService = require('../../services/authService');

const CAT_LABEL = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

Page({
  data: {
    loading: true,
    reviews: [],
    serviceOptions: [],
    selectedService: 'all',
    ratingOptions: [
      { value: 'all', label: '全部评价' },
      { value: 'good', label: '好评(4-5星)' },
      { value: 'mid', label: '中评(3星)' },
      { value: 'bad', label: '差评(1-2星)' },
      { value: '5', label: '5星' },
      { value: '4', label: '4星' },
      { value: '3', label: '3星' },
      { value: '2', label: '2星' },
      { value: '1', label: '1星' },
    ],
    selectedRating: 'all',
    sortOptions: [
      { value: 'time', label: '按时间' },
      { value: 'rating', label: '按评分' },
    ],
    selectedSort: 'time',
    totalReviews: 0,
    totalOrders: 0,
    reviewedOrders: 0,
    avgRating: '0.0',
    avgRatingRound: 0,
    good: 0,
    ratingDist: [],
    // 回复
    showReplyPopup: false,
    replyOrderId: '',
    replyContent: '',
    replySaving: false,
  },

  _allOrders: [],
  _allReviewed: [],

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo || !userInfo.agencyProfileId) {
      wx.showToast({ title: '请先登录机构', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中...' });
    await this._load(userInfo.agencyProfileId);
    wx.hideLoading();
  },

  async _load(pid) {
    const db = wx.cloud.database();
    let allOrders = [];
    try {
      const res = await db.collection('user_orders')
        .where({ orderType: 'agency', agencyProfileId: pid })
        .orderBy('createTime', 'desc')
        .limit(200)
        .get();
      allOrders = res.data || [];
    } catch (e) {
      console.warn('[Reviews] load', e);
    }

    const reviewed = allOrders
      .filter(o => o.review && o.review.rating)
      .map(o => this._normalizeOrder(o));

    this._allOrders = allOrders.map(o => this._normalizeOrder(o));
    this._allReviewed = reviewed;

    this._buildServiceOptions(reviewed);
    this._applyFilters();
    this.setData({ loading: false });
  },

  _normalizeOrder(o) {
    return {
      ...o,
      serviceKey: o.serviceId || o.serviceName || o._id,
      serviceName: o.serviceName || '未知服务',
      catLabel: CAT_LABEL[o.category] || '其他',
      reviewTimeStr: o.review ? this._formatTime(o.review.createTime) : '',
    };
  },

  _buildServiceOptions(reviewed) {
    const map = {};
    reviewed.forEach(item => {
      if (!map[item.serviceKey]) {
        map[item.serviceKey] = {
          value: item.serviceKey,
          label: item.serviceName,
        };
      }
    });
    const serviceOptions = [{ value: 'all', label: '全部服务' }, ...Object.values(map)];
    this.setData({ serviceOptions });
  },

  onSelectRating(e) {
    const { value } = e.currentTarget.dataset;
    if (!value || value === this.data.selectedRating) return;
    this.setData({ selectedRating: value });
    this._applyFilters();
  },

  onSelectService(e) {
    const { value } = e.currentTarget.dataset;
    if (!value || value === this.data.selectedService) return;
    this.setData({ selectedService: value });
    this._applyFilters();
  },

  onSelectSort(e) {
    const { value } = e.currentTarget.dataset;
    if (!value || value === this.data.selectedSort) return;
    this.setData({ selectedSort: value });
    this._applyFilters();
  },

  onResetFilters() {
    this.setData({
      selectedService: 'all',
      selectedRating: 'all',
      selectedSort: 'time',
    });
    this._applyFilters();
  },

  _applyFilters() {
    const { selectedService, selectedRating, selectedSort } = this.data;

    const filteredReviewed = this._allReviewed.filter(item => {
      const passService = selectedService === 'all' || item.serviceKey === selectedService;
      const passRating = this._matchRatingFilter(item.review.rating, selectedRating);
      return passService && passRating;
    }).sort((a, b) => {
      if (selectedSort === 'rating') {
        const ra = Number(a.review && a.review.rating) || 0;
        const rb = Number(b.review && b.review.rating) || 0;
        if (rb !== ra) return rb - ra;
      }
      const ta = a.review && a.review.createTime ? new Date(a.review.createTime).getTime() : 0;
      const tb = b.review && b.review.createTime ? new Date(b.review.createTime).getTime() : 0;
      return tb - ta;
    });

    const filteredOrders = this._allOrders.filter(item =>
      selectedService === 'all' || item.serviceKey === selectedService
    );

    this._calcStats(filteredOrders, filteredReviewed);
    this.setData({ reviews: filteredReviewed });
  },

  _matchRatingFilter(rating, filterType) {
    const r = Math.round(Number(rating) || 0);
    if (filterType === 'all') return true;
    if (filterType === 'good') return r >= 4;
    if (filterType === 'mid') return r === 3;
    if (filterType === 'bad') return r <= 2;
    return r === Number(filterType);
  },

  _calcStats(allOrders, reviewed) {
    const total = reviewed.length;
    let sumRating = 0;
    const distMap = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    reviewed.forEach(o => {
      const r = o.review.rating;
      sumRating += r;
      const key = Math.min(5, Math.max(1, Math.round(r)));
      distMap[key]++;
    });

    const avg = total > 0 ? sumRating / total : 0;
    const goodCount = (distMap[5] || 0) + (distMap[4] || 0);
    const goodRate = total > 0 ? Math.round((goodCount / total) * 100) : 0;

    const maxDist = Math.max(...Object.values(distMap), 1);
    const ratingDist = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: distMap[star],
      percent: Math.round((distMap[star] / maxDist) * 100),
    }));

    this.setData({
      totalReviews: total,
      totalOrders: allOrders.length,
      reviewedOrders: total,
      avgRating: avg.toFixed(1),
      avgRatingRound: Math.round(avg * 2) / 2,
      good: goodRate,
      ratingDist,
    });
  },

  // ====== 回复评价 ======

  openReplyPopup(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._allOrders.find(o => o._id === id);
    const existingReply = (order && order.review && order.review.reply) || '';
    this.setData({
      showReplyPopup: true,
      replyOrderId: id,
      replyContent: existingReply,
    });
  },

  closeReplyPopup() {
    this.setData({
      showReplyPopup: false,
      replyOrderId: '',
      replyContent: '',
    });
  },

  onReplyInput(e) {
    this.setData({ replyContent: e.detail.value });
  },

  async submitReply() {
    const content = this.data.replyContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }
    if (this.data.replySaving) return;
    this.setData({ replySaving: true });

    try {
      const db = wx.cloud.database();
      await db.collection('user_orders').doc(this.data.replyOrderId).update({
        data: { 'review.reply': content },
      });

      // 更新本地数据
      const order = this._allOrders.find(o => o._id === this.data.replyOrderId);
      if (order) {
        if (!order.review) order.review = {};
        order.review.reply = content;
      }

      wx.showToast({ title: '回复成功', icon: 'success' });
      this.closeReplyPopup();
      this._applyFilters();
    } catch (err) {
      console.error('[Reviews] reply error', err);
      wx.showToast({ title: '回复失败', icon: 'none' });
    } finally {
      this.setData({ replySaving: false });
    }
  },

  _formatTime(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
});
