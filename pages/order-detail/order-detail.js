// pages/order-detail/order-detail.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');
const { formatDateTime, buildPetInfoText, getStatusBarHeight } = require('../../utils/helpers');

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
    order: null,
    loading: true,
    _userId: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    // 评价弹窗
    showReview: false,
    reviewRating: 5,
    reviewContent: '',
    submittingReview: false,
    editReviewId: '',
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const { id } = options;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }

    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    this._userRole = userInfo.role || 'pet_owner';
    this._agencyProfileId = userInfo.agencyProfileId || '';
    this.setData({ _userId: this._userId });
    this.loadOrder(id);
  },

  onUnload() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  onViewPetDetail(e) {
    const petId = e.currentTarget.dataset.petid;
    if (!petId) return;
    wx.navigateTo({ url: `/pages/pet-detail/pet-detail?id=${petId}` });
  },

  async loadOrder(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('user_orders').doc(id).get();
      const raw = res.data;

      // 权限检查：宠主只能看自己的订单，机构可以看分配给自己的订单
      const isOwner = raw.ownerId === this._userId;
      const isAgency = this._userRole === 'agency' && raw.agencyProfileId === this._agencyProfileId;
      const isAdmin = this._userRole === 'admin';
      if (!isOwner && !isAgency && !isAdmin) {
        wx.showToast({ title: '无权查看该订单', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      // 解析图片
      if (Array.isArray(raw.images) && raw.images.length) {
        raw.images = await resolveTempUrls(raw.images);
      }

      // 补充机构名称
      if (raw.agencyProfileId && !raw.agencyName) {
        try {
          const agencyRes = await db.collection('agency_profiles').doc(raw.agencyProfileId).get();
          raw.agencyName = (agencyRes.data || {}).orgName || '';
        } catch (e) { /* ignore */ }
      }

      // 加载用户信息（机构/管理员查看时）
      if (!isOwner && raw.ownerId) {
        try {
          const userRes = await db.collection('users').doc(raw.ownerId).get();
          raw.ownerInfo = userRes.data || {};
        } catch (e) { /* ignore */ }
      }

      const order = this._buildOrder(raw);
      this.setData({ order, loading: false });

      // 待付款启动倒计时
      if (order.orderStatus === 'unpaid' && order.payDeadline) {
        this._startCountdownTick();
      }
    } catch (e) {
      console.error('[OrderDetail] load', e);
      this.setData({ order: null, loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  _buildOrder(raw) {
    const configMap = raw.orderType === 'express' ? EXPRESS_STATUS_CONFIG : STATUS_CONFIG;
    const config = configMap[raw.orderStatus] || {};
    const petInfo = raw.petInfo || {};
    return {
      ...raw,
      statusConfig: config,
      categoryText: CAT_TEXT[raw.category] || raw.category || '',
      createTimeStr: formatDateTime(raw.createTime),
      updateTimeStr: formatDateTime(raw.updateTime),
      petInfoText: buildPetInfoText(petInfo),
      genderText: petInfo.gender === 'male' ? '公' : petInfo.gender === 'female' ? '母' : '',
      review: raw.review ? {
        ...raw.review,
        ratingArr: new Array(raw.review.rating || 0).fill(1),
      } : null,
      countdownText: this._buildCountdownText(raw.payDeadline),
      countdownExpired: this._isCountdownExpired(raw.payDeadline),
    };
  },

  // 倒计时
  _buildCountdownText(payDeadline) {
    if (!payDeadline) return '';
    const deadline = typeof payDeadline === 'string' ? new Date(payDeadline).getTime() : (payDeadline instanceof Date ? payDeadline.getTime() : Number(payDeadline));
    if (!deadline) return '';
    const diff = deadline - Date.now();
    if (diff <= 0) return '付款已超时';
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return `剩余 ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },

  _isCountdownExpired(payDeadline) {
    if (!payDeadline) return false;
    const deadline = typeof payDeadline === 'string' ? new Date(payDeadline).getTime() : (payDeadline instanceof Date ? payDeadline.getTime() : Number(payDeadline));
    return deadline > 0 && deadline <= Date.now();
  },

  _startCountdownTick() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    this._countdownTimer = setInterval(() => {
      const order = this.data.order;
      if (!order || order.orderStatus !== 'unpaid') {
        clearInterval(this._countdownTimer);
        return;
      }
      const expired = this._isCountdownExpired(order.payDeadline);
      if (expired) {
        clearInterval(this._countdownTimer);
        this._autoCancelExpired(order._id);
        return;
      }
      this.setData({
        'order.countdownText': this._buildCountdownText(order.payDeadline),
        'order.countdownExpired': false,
      });
    }, 1000);
  },

  async _autoCancelExpired(orderId) {
    try {
      const db = wx.cloud.database();
      await db.collection('user_orders').doc(orderId).update({
        data: { orderStatus: 'cancelled', updateTime: db.serverDate() },
      });
      const order = this.data.order;
      if (order && order.category === 'foster' && order.petId) {
        try {
          await db.collection('pets').doc(order.petId).update({
            data: { petStatus: '', updateTime: db.serverDate() },
          });
        } catch (e) { /* ignore */ }
      }
      this.loadOrder(orderId);
    } catch (e) { /* ignore */ }
  },

  // 去付款
  onPay() {
    wx.navigateTo({ url: `/pages/payment/payment?id=${this.data.order._id}` });
  },

  // 确认完成 / 确认取件
  onConfirmComplete() {
    const order = this.data.order;
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
          await db.collection('user_orders').doc(order._id).update({
            data: { orderStatus: 'completed', updateTime: db.serverDate() },
          });
          if (order.category === 'foster' && order.petId) {
            try {
              await db.collection('pets').doc(order.petId).update({
                data: { petStatus: '', updateTime: db.serverDate() },
              });
            } catch (e) { /* ignore */ }
          }
          wx.hideLoading();
          wx.showToast({ title: '已确认完成' });
          this.loadOrder(order._id);
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  // 评价
  openReview() {
    this.setData({ showReview: true, editReviewId: '', reviewRating: 5, reviewContent: '' });
  },

  openEditReview() {
    const review = this.data.order.review;
    if (!review) return;
    this.setData({
      showReview: true,
      editReviewId: this.data.order._id,
      reviewRating: review.rating || 5,
      reviewContent: review.content || '',
    });
  },

  deleteReview() {
    wx.showModal({
      title: '删除评价',
      content: '确定要删除这条评价吗？删除后不可恢复。',
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          await db.collection('user_orders').doc(this.data.order._id).update({
            data: { review: db.command.remove() },
          });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadOrder(this.data.order._id);
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  closeReview() {
    this.setData({ showReview: false, editReviewId: '' });
  },

  onCloseReview() {
    this.setData({ showReview: false, editReviewId: '' });
  },

  async onSubmitReview(e) {
    const { orderId, rating, content } = e.detail;
    const { editReviewId } = this.data;
    if (!content.trim()) return wx.showToast({ title: '请输入评价内容', icon: 'none' });
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      if (editReviewId) {
        await db.collection('user_orders').doc(editReviewId).update({
          data: {
            'review.rating': rating,
            'review.content': content.trim(),
          },
        });
        wx.showToast({ title: '修改成功' });
      } else {
        await db.collection('user_orders').doc(orderId).update({
          data: {
            review: { rating, content: content.trim(), createTime: db.serverDate() },
          },
        });
        wx.showToast({ title: '评价成功' });
      }
      this.setData({ showReview: false, editReviewId: '' });
      this.loadOrder(orderId);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
  },

  onRatingChange(e) {
    this.setData({ reviewRating: e.detail });
  },

  onReviewContentChange(e) {
    this.setData({ reviewContent: e.detail.value || e.detail });
  },

  async submitReview() {
    const { reviewRating, reviewContent, editReviewId } = this.data;
    if (!reviewContent.trim()) return wx.showToast({ title: '请输入评价内容', icon: 'none' });
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      if (editReviewId) {
        await db.collection('user_orders').doc(editReviewId).update({
          data: {
            'review.rating': reviewRating,
            'review.content': reviewContent.trim(),
          },
        });
        wx.showToast({ title: '修改成功' });
      } else {
        await db.collection('user_orders').doc(this.data.order._id).update({
          data: {
            review: { rating: reviewRating, content: reviewContent.trim(), createTime: db.serverDate() },
          },
        });
        wx.showToast({ title: '评价成功' });
      }
      this.setData({ showReview: false, editReviewId: '' });
      this.loadOrder(this.data.order._id);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
  },

  previewImg(e) {
    const src = e.currentTarget.dataset.src;
    const list = e.currentTarget.dataset.list || [src];
    wx.previewImage({ current: src, urls: list });
  },

  onShareAppMessage() {
    const { order } = this.data;
    return {
      title: `订单详情 - ${order?.serviceName || '就宠你'}`,
      path: `/pages/order-detail/order-detail?id=${order?._id}`,
    };
  },
});
