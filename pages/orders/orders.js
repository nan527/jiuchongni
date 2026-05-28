// pages/orders/orders.js
const authService = require('../../services/authService');

const STATUS_FILTER = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'active', label: '进行中' },
  { key: 'to_confirm', label: '待确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const STATUS_CONFIG = {
  pending:     { label: '待接单',   color: '#EF6C00', bg: '#FFF8E1' },
  confirmed:   { label: '已接单',   color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { label: '服务中',   color: '#2E7D32', bg: '#E8F5E9' },
  to_confirm:  { label: '待确认',   color: '#E65100', bg: '#FFF3E0' },
  completed:   { label: '已完成',   color: '#66BB6A', bg: '#E8F5E9' },
  cancelled:   { label: '已取消',   color: '#999',    bg: '#F5F5F5' },
};

const FOSTER_STATUS_CONFIG = {
  pending:     { label: '待寄养',   color: '#EF6C00', bg: '#FFF8E1' },
  confirmed:   { label: '寄养中',   color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { label: '寄养中',   color: '#2E7D32', bg: '#E8F5E9' },
  to_confirm:  { label: '待取回',   color: '#E65100', bg: '#FFF3E0' },
  completed:   { label: '已取回',   color: '#66BB6A', bg: '#E8F5E9' },
  cancelled:   { label: '已取消',   color: '#999',    bg: '#F5F5F5' },
};

Page({
  data: {
    activeTab: 0,
    statusFilter: STATUS_FILTER,
    activeStatus: 'all',
    loading: true,
    allOrders: [],
    filteredOrders: [],
    // 评价弹窗
    showReview: false,
    reviewOrderId: '',
    reviewRating: 5,
    reviewContent: '',
    submittingReview: false,
  },

  onLoad(options) {
    if (options.tab !== undefined) {
      const tabIndex = parseInt(options.tab, 10);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < STATUS_FILTER.length) {
        this.setData({ activeTab: tabIndex });
      }
    }
    if (options.status) {
      const validStatuses = STATUS_FILTER.map(f => f.key);
      if (validStatuses.includes(options.status)) {
        this.setData({ activeStatus: options.status });
      }
    }
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    this.loadOrders();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.index, activeStatus: 'all' });
    this.applyFilter();
  },

  onStatusFilter(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeStatus: key });
    this.applyFilter();
  },

  applyFilter() {
    const { allOrders, activeTab, activeStatus } = this.data;
    let list = allOrders;

    // Tab 过滤
    if (activeTab === 1) list = list.filter(o => o.orderType === 'personal');
    if (activeTab === 2) list = list.filter(o => o.orderType === 'agency');

    // 状态过滤
    if (activeStatus === 'pending') list = list.filter(o => o.orderStatus === 'pending');
    else if (activeStatus === 'active') list = list.filter(o => o.orderStatus === 'confirmed' || o.orderStatus === 'in_progress');
    else if (activeStatus === 'to_confirm') list = list.filter(o => o.orderStatus === 'to_confirm');
    else if (activeStatus === 'completed') list = list.filter(o => o.orderStatus === 'completed');
    else if (activeStatus === 'cancelled') list = list.filter(o => o.orderStatus === 'cancelled');

    this.setData({ filteredOrders: list });
  },

  async loadOrders() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ allOrders: [], filteredOrders: [], loading: false });
      return;
    }
    this.setData({ loading: true });
    const db = wx.cloud.database();
    let list = [];

    try {
      const res = await db.collection('user_orders')
        .where({ ownerId: userId })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      list = (res.data || []).filter(item => item.ownerId === userId).map(item => {
        const isFoster = item.category === 'foster';
        const statusMap = isFoster ? FOSTER_STATUS_CONFIG : STATUS_CONFIG;
        const config = statusMap[item.orderStatus] || {};
        return {
          ...item,
          statusConfig: config,
          createTimeStr: this._formatTime(item.createTime),
          leaveRemainText: this._buildLeaveRemainText(item.leaveTimeMs),
          isLeaveExpired: this._isLeaveExpired(item.leaveTimeMs),
          petInfoText: this._buildPetInfoText(item.petInfo),
          review: item.review ? {
            ...item.review,
            ratingArr: new Array(item.review.rating || 0).fill(1),
          } : null,
        };
      });
    } catch (e) { /* ignore */ }

    this.setData({ allOrders: list, loading: false });
    this.applyFilter();
  },

  onConfirmComplete(e) {
    const id = e.currentTarget.dataset.id;
    const category = e.currentTarget.dataset.category || '';
    const isFoster = category === 'foster';
    wx.showModal({
      title: isFoster ? '确认取回' : '确认完成',
      content: isFoster ? '确认已取回宠物？' : '确认机构已完成该服务？',
      confirmColor: '#FF9800',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          const db = wx.cloud.database();
          const targetOrder = this.data.allOrders.find(o => o._id === id);
          await db.collection('user_orders').doc(id).update({
            data: { orderStatus: 'completed', updateTime: db.serverDate() },
          });
          if (targetOrder && targetOrder.orderType === 'agency' && targetOrder.category === 'foster' && targetOrder.petId) {
            try {
              await db.collection('pets').doc(targetOrder.petId).update({
                data: { petStatus: '', updateTime: db.serverDate() },
              });
            } catch (petErr) { /* ignore */ }
          }
          wx.hideLoading();
          wx.showToast({ title: '已确认完成' });
          this.loadOrders();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  openReview(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ showReview: true, reviewOrderId: id, reviewRating: 5, reviewContent: '' });
  },

  closeReview() {
    this.setData({ showReview: false, reviewOrderId: '' });
  },

  onRatingChange(e) {
    this.setData({ reviewRating: e.detail });
  },

  onReviewContentChange(e) {
    this.setData({ reviewContent: e.detail.value || e.detail });
  },

  async submitReview() {
    const { reviewOrderId, reviewRating, reviewContent } = this.data;
    if (!reviewContent.trim()) return wx.showToast({ title: '请输入评价内容', icon: 'none' });
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      await db.collection('user_orders').doc(reviewOrderId).update({
        data: {
          review: { rating: reviewRating, content: reviewContent.trim(), createTime: db.serverDate() },
        },
      });
      wx.showToast({ title: '评价成功' });
      this.setData({ showReview: false, reviewOrderId: '' });
      this.loadOrders();
    } catch (e) {
      wx.showToast({ title: '评价失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
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

  _buildPetInfoText(petInfo) {
    if (!petInfo) return '';
    const species = petInfo.species || '';
    const age = petInfo.age ? `${petInfo.age}岁` : '';
    if (species && age) return `${species} · ${age}`;
    return species || age || '';
  },

  _buildLeaveRemainText(leaveTimeMs) {
    const ms = Number(leaveTimeMs) || 0;
    if (!ms) return '';
    const diff = ms - Date.now();
    if (diff <= 0) return '已离开（待机构确认）';
    const totalHours = Math.ceil(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) return `还有${days}天${hours}小时离开`;
    return `还有${hours}小时离开`;
  },

  _isLeaveExpired(leaveTimeMs) {
    const ms = Number(leaveTimeMs) || 0;
    return ms > 0 && ms <= Date.now();
  },
});
