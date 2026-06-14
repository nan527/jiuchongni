// pages/payment/payment.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');
const { buildPetInfoText, getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    orderId: '',
    order: {},
    payMethod: 'balance',
    paying: false,
    countdownText: '',
    expired: false,
    statusBarHeight: 0,
    navBarHeight: 0,
    balance: 0,
  },

  _timer: null,

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    if (options.id) {
      this.setData({ orderId: options.id });
      this.loadOrder(options.id);
    }
    this.loadBalance();
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },

  async loadOrder(id) {
    const db = wx.cloud.database();
    try {
      const res = await db.collection('user_orders').doc(id).get();
      const order = res.data || {};
      // 解析图片
      if (Array.isArray(order.images) && order.images.length) {
        order.images = await resolveTempUrls(order.images);
      }
      order.petInfoText = buildPetInfoText(order.petInfo);
      this.setData({ order });
      this._startCountdown(order.payDeadline);
    } catch (e) {
      console.error('[Payment] 加载订单失败', e);
      wx.showToast({ title: '订单不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },

  _startCountdown(payDeadline) {
    if (!payDeadline) return;
    const deadline = typeof payDeadline === 'string' ? new Date(payDeadline).getTime()
      : (payDeadline instanceof Date ? payDeadline.getTime() : Number(payDeadline));
    if (!deadline) return;

    const update = () => {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        this.setData({ countdownText: '', expired: true });
        clearInterval(this._timer);
        return;
      }
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      this.setData({
        countdownText: `剩余 ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      });
    };

    update();
    this._timer = setInterval(update, 1000);
  },

  onPayMethodChange(e) {
    this.setData({ payMethod: e.detail });
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadBalance() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_user_balance' },
      });
      if (res.result.success) {
        this.setData({ balance: res.result.balance || 0 });
      }
    } catch (e) {
      console.error('[Payment] loadBalance failed', e);
    }
  },

  async onConfirmPay() {
    if (this.data.expired) return wx.showToast({ title: '支付已超时', icon: 'none' });
    if (this.data.paying) return;
    this.setData({ paying: true });

    const { orderId, payMethod, order, balance } = this.data;
    const price = Number(order.price) || 0;

    // 余额支付：检查余额是否充足
    if (payMethod === 'balance' && balance < price) {
      this.setData({ paying: false });
      wx.showModal({
        title: '余额不足',
        content: `当前余额 ¥${balance.toFixed(2)}，需支付 ¥${price}，请先充值。`,
        confirmText: '去充值',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/balance/balance' });
          }
        },
      });
      return;
    }

    wx.showModal({
      title: '确认支付',
      content: `确认使用${payMethod === 'wechat' ? '微信' : '余额'}支付 ¥${price}？`,
      confirmColor: '#FF9800',
      success: async (res) => {
        if (!res.confirm) {
          this.setData({ paying: false });
          return;
        }
        wx.showLoading({ title: '支付中...' });
        try {
          // 余额支付：扣减余额
          if (payMethod === 'balance') {
            const deductRes = await wx.cloud.callFunction({
              name: 'ai_handler',
              data: {
                action: 'deduct_balance',
                amount: price,
                description: `订单支付-${order.serviceName || '服务'}`,
              },
            });
            if (!deductRes.result.success) {
              wx.hideLoading();
              wx.showToast({ title: deductRes.result.msg || '余额扣减失败', icon: 'none' });
              this.setData({ paying: false });
              return;
            }
          }

          const db = wx.cloud.database();
          const nextStatus = order.orderType === 'express' ? 'pending_ship' : 'pending';
          await db.collection('user_orders').doc(orderId).update({
            data: {
              orderStatus: nextStatus,
              payMethod,
              payTime: db.serverDate(),
              updateTime: db.serverDate(),
            },
          });
          // 寄养订单付款后更新宠物状态
          if (order.category === 'foster' && order.petId) {
            try {
              await db.collection('pets').doc(order.petId).update({
                data: { petStatus: 'pending_foster', updateTime: db.serverDate() },
              });
            } catch (petErr) { /* ignore */ }
          }
          wx.hideLoading();
          wx.showToast({ title: '付款成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 800);
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '付款失败', icon: 'none' });
          this.setData({ paying: false });
        }
      },
      fail: () => {
        this.setData({ paying: false });
      },
    });
  },
});
