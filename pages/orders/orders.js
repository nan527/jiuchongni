// pages/orders/orders.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');
const { formatDate, buildPetInfoText, buildLeaveRemainText, isLeaveExpired, getStatusBarHeight } = require('../../utils/helpers');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const STATUS_FILTER = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待付款' },
  { key: 'pending', label: '待接单' },
  { key: 'in_progress', label: '进行中' },
  { key: 'to_confirm', label: '待确认' },
  { key: 'to_review', label: '待评价' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const EXPRESS_STATUS_FILTER = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待支付' },
  { key: 'pending_ship', label: '待发货' },
  { key: 'shipped', label: '已发货' },
  { key: 'to_pickup', label: '待取件' },
  { key: 'to_review', label: '待评价' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const STATUS_CONFIG = {
  unpaid:      { label: '待付款',   color: '#EF6C00', bg: '#FFF8E1' },
  pending:     { label: '待接单',   color: '#1565C0', bg: '#E3F2FD' },
  confirmed:   { label: '已接单',   color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { label: '进行中',   color: '#2E7D32', bg: '#E8F5E9' },
  to_confirm:  { label: '待确认',   color: '#E65100', bg: '#FFF3E0' },
  to_review:   { label: '待评价',   color: '#7B1FA2', bg: '#F3E5F5' },
  completed:   { label: '已完成',   color: '#66BB6A', bg: '#E8F5E9' },
  cancelled:   { label: '已取消',   color: '#999',    bg: '#F5F5F5' },
};

const EXPRESS_STATUS_CONFIG = {
  unpaid:       { label: '待支付', color: '#EF6C00', bg: '#FFF8E1' },
  pending_ship: { label: '待发货', color: '#1565C0', bg: '#E3F2FD' },
  shipped:      { label: '已发货', color: '#0277BD', bg: '#E0F7FA' },
  to_pickup:    { label: '待取件', color: '#E65100', bg: '#FFF3E0' },
  completed:    { label: '已完成', color: '#66BB6A', bg: '#E8F5E9' },
  cancelled:    { label: '已取消', color: '#999',    bg: '#F5F5F5' },
};

const CAT_TEXT = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

Page({
  data: {
    tabList: [
      { key: 'all', label: '全部' },
      { key: 'agency', label: '机构服务' },
      { key: 'express', label: '快递服务' },
    ],
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
    editReviewId: '',
    // 导航栏
    statusBarHeight: 0,
    navBarHeight: 0,
    headerHeight: 0,
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    const headerHeight = navBarHeight + 80;
    this.setData({ statusBarHeight, navBarHeight, headerHeight });

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

  onUnload() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  onGoBack() {
    // tab 页不支持 navigateBack，直接切换到首页
    wx.switchTab({ url: '/pages/index/index' });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
      return;
    }
    this._userId = userInfo._id;
    this.loadOrders();
  },

  onTabChange(e) {
    const idx = e.currentTarget.dataset.index;
    const statusFilter = idx === 2 ? EXPRESS_STATUS_FILTER : STATUS_FILTER;
    this.setData({ activeTab: idx, activeStatus: 'all', statusFilter });
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

    if (activeTab === 1) list = list.filter(o => o.orderType === 'agency');
    else if (activeTab === 2) list = list.filter(o => o.orderType === 'express');

    if (activeStatus !== 'all') {
      if (activeStatus === 'to_review') {
        list = list.filter(o => o.orderStatus === 'completed' && !o.review);
      } else {
        list = list.filter(o => o.orderStatus === activeStatus);
      }
    }

    this.setData({ filteredOrders: list.map((item, idx) => ({ ...item, _animDelay: idx * 100 })) });
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
      const res = await withTimeout(
        db.collection('user_orders')
          .where({ ownerId: userId })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get(),
        8000
      );
      list = (res.data || []).filter(item => item.ownerId === userId).map(item => {
        const configMap = item.orderType === 'express' ? EXPRESS_STATUS_CONFIG : STATUS_CONFIG;
        const config = configMap[item.orderStatus] || {};
        return {
          ...item,
          statusConfig: config,
          categoryText: CAT_TEXT[item.category] || item.category || '',
          createTimeStr: formatDate(item.createTime),
          leaveRemainText: buildLeaveRemainText(item.leaveTimeMs),
          isLeaveExpired: isLeaveExpired(item.leaveTimeMs),
          petInfoText: buildPetInfoText(item.petInfo),
          countdownText: this._buildCountdownText(item.payDeadline),
          countdownExpired: this._isCountdownExpired(item.payDeadline),
          review: item.review ? {
            ...item.review,
            ratingArr: new Array(item.review.rating || 0).fill(1),
          } : null,
        };
      });
    } catch (e) { /* ignore */ }

    // 解析云存储图片
    for (const order of list) {
      if (Array.isArray(order.images) && order.images.length) {
        order.images = await resolveTempUrls(order.images);
      }
    }

    // 补充缺失的机构名称
    const missingAgencyIds = [...new Set(list
      .filter(o => o.agencyProfileId && !o.agencyName)
      .map(o => o.agencyProfileId))];
    if (missingAgencyIds.length > 0) {
      try {
        const _ = db.command;
        const agencyRes = await withTimeout(
          db.collection('agency_profiles')
            .where({ _id: _.in(missingAgencyIds) })
            .field({ _id: true, orgName: true })
            .get(),
          8000
        );
        const agencyMap = {};
        (agencyRes.data || []).forEach(a => { agencyMap[a._id] = a.orgName; });
        list.forEach(o => {
          if (!o.agencyName && agencyMap[o.agencyProfileId]) {
            o.agencyName = agencyMap[o.agencyProfileId];
          }
        });
      } catch (e) { /* ignore */ }
    }

    this.setData({ allOrders: list, loading: false });
    this.applyFilter();
    this._startCountdownTick();
  },

  // 付款倒计时
  _buildCountdownText(payDeadline) {
    if (!payDeadline) return '';
    const deadline = typeof payDeadline === 'string' ? new Date(payDeadline).getTime() : (payDeadline instanceof Date ? payDeadline.getTime() : Number(payDeadline));
    if (!deadline) return '';
    const diff = deadline - Date.now();
    if (diff <= 0) return '付款已超时';
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return `剩余 ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} 请尽快付款`;
  },

  _isCountdownExpired(payDeadline) {
    if (!payDeadline) return false;
    const deadline = typeof payDeadline === 'string' ? new Date(payDeadline).getTime() : (payDeadline instanceof Date ? payDeadline.getTime() : Number(payDeadline));
    return deadline > 0 && deadline <= Date.now();
  },

  _startCountdownTick() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    const hasUnpaid = this.data.allOrders.some(o => o.orderStatus === 'unpaid' && o.payDeadline);
    if (!hasUnpaid) return;

    this._countdownTimer = setInterval(() => {
      const allOrders = this.data.allOrders.map(item => {
        if (item.orderStatus !== 'unpaid' || !item.payDeadline) return item;
        const expired = this._isCountdownExpired(item.payDeadline);
        // 超时自动取消
        if (expired && item.orderStatus === 'unpaid') {
          this._autoCancelExpired(item._id);
        }
        return {
          ...item,
          countdownText: this._buildCountdownText(item.payDeadline),
          countdownExpired: expired,
        };
      });
      this.setData({ allOrders });
      this.applyFilter();
    }, 1000);
  },

  async _autoCancelExpired(orderId) {
    try {
      const db = wx.cloud.database();
      const order = this.data.allOrders.find(o => o._id === orderId);
      await withTimeout(
        db.collection('user_orders').doc(orderId).update({
          data: { orderStatus: 'cancelled', updateTime: db.serverDate() },
        }),
        8000
      );
      // 寄养订单取消时重置宠物状态
      if (order && order.category === 'foster' && order.petId) {
        try {
          await withTimeout(
            db.collection('pets').doc(order.petId).update({
              data: { petStatus: '', updateTime: db.serverDate() },
            }),
            8000
          );
        } catch (petErr) { /* ignore */ }
      }
      this.loadOrders();
    } catch (e) { /* ignore */ }
  },

  // 虚拟付款
  onPayOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/payment/payment?id=${id}` });
  },

  // 订单详情
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.allOrders.find(o => o._id === id);
    if (!order) return;
    // 待付款订单点击跳转支付页
    if (order.orderStatus === 'unpaid') {
      wx.navigateTo({ url: `/pages/payment/payment?id=${id}` });
      return;
    }
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
  },

  onImageError(e) {
    const idx = e.currentTarget.dataset.idx;
    const orders = this.data.filteredOrders;
    if (orders[idx]) {
      orders[idx] = { ...orders[idx], _imgError: true };
      this.setData({ filteredOrders: orders });
    }
  },

  // 确认完成 / 确认取件
  onConfirmComplete(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.allOrders.find(o => o._id === id);
    if (!order) return;
    const isPickup = order.orderStatus === 'to_pickup';
    const isFoster = order.category === 'foster';
    wx.showModal({
      title: isPickup ? '确认取件' : (isFoster ? '确认取回' : '确认完成'),
      content: isPickup ? '确认已取到快递？' : (isFoster ? '确认已取回宠物？' : '确认机构已完成该服务？'),
      confirmColor: '#FF9800',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          const db = wx.cloud.database();
          const targetOrder = this.data.allOrders.find(o => o._id === id);
          await withTimeout(
            db.collection('user_orders').doc(id).update({
              data: { orderStatus: 'completed', updateTime: db.serverDate() },
            }),
            8000
          );
          if (targetOrder && targetOrder.orderType === 'agency' && targetOrder.category === 'foster' && targetOrder.petId) {
            try {
              await withTimeout(
                db.collection('pets').doc(targetOrder.petId).update({
                  data: { petStatus: '', updateTime: db.serverDate() },
                }),
                8000
              );
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

  // 评价
  openReview(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ showReview: true, reviewOrderId: id, editReviewId: '', reviewRating: 5, reviewContent: '' });
  },

  openEditReview(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.allOrders.find(o => o._id === id);
    if (!order || !order.review) return;
    this.setData({
      showReview: true,
      reviewOrderId: id,
      editReviewId: id,
      reviewRating: order.review.rating || 5,
      reviewContent: order.review.content || '',
    });
  },

  deleteReview(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除评价',
      content: '确定要删除这条评价吗？删除后不可恢复。',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          await withTimeout(
            db.collection('user_orders').doc(id).update({
              data: { review: db.command.remove() },
            }),
            8000
          );
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadOrders();
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  closeReview() {
    this.setData({ showReview: false, reviewOrderId: '', editReviewId: '' });
  },

  onCloseReview() {
    this.closeReview();
  },

  async onSubmitReview(e) {
    const { orderId, rating, content } = e.detail;
    const editReviewId = this.data.editReviewId;
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      if (editReviewId) {
        await withTimeout(
          db.collection('user_orders').doc(editReviewId).update({
            data: {
              'review.rating': rating,
              'review.content': content.trim(),
            },
          }),
          8000
        );
        wx.showToast({ title: '修改成功' });
      } else {
        await withTimeout(
          db.collection('user_orders').doc(orderId).update({
            data: {
              review: { rating: rating, content: content.trim(), createTime: db.serverDate() },
            },
          }),
          8000
        );
        wx.showToast({ title: '评价成功' });
      }
      this.setData({ showReview: false, reviewOrderId: '', editReviewId: '' });
      this.loadOrders();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
  },

  goToIndex() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onRatingChange(e) {
    this.setData({ reviewRating: e.detail });
  },

  onReviewContentChange(e) {
    this.setData({ reviewContent: e.detail.value || e.detail });
  },

  async submitReview() {
    const { reviewOrderId, reviewRating, reviewContent, editReviewId } = this.data;
    if (!reviewContent.trim()) return wx.showToast({ title: '请输入评价内容', icon: 'none' });
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      if (editReviewId) {
        await withTimeout(
          db.collection('user_orders').doc(editReviewId).update({
            data: {
              'review.rating': reviewRating,
              'review.content': reviewContent.trim(),
            },
          }),
          8000
        );
        wx.showToast({ title: '修改成功' });
      } else {
        await withTimeout(
          db.collection('user_orders').doc(reviewOrderId).update({
            data: {
              review: { rating: reviewRating, content: reviewContent.trim(), createTime: db.serverDate() },
            },
          }),
          8000
        );
        wx.showToast({ title: '评价成功' });
      }
      this.setData({ showReview: false, reviewOrderId: '', editReviewId: '' });
      this.loadOrders();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
  },
});
