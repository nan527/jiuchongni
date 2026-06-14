// pages/balance/balance.js
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    balance: '0.00',
    selectedAmount: 10,
    recharging: false,
    logs: [],

    rechargeOptions: [
      { amount: 5, gift: 0 },
      { amount: 10, gift: 1 },
      { amount: 20, gift: 1 },
      { amount: 50, gift: 3 },
      { amount: 100, gift: 7 },
    ],
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadBalance();
    this.loadLogs();
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
        this.setData({ balance: (res.result.balance || 0).toFixed(2) });
      }
    } catch (e) {
      console.error('[balance] loadBalance failed', e);
    }
  },

  async loadLogs() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_balance_logs', page: 1, pageSize: 50 },
      });
      if (res.result.success) {
        const logs = (res.result.data || []).map(item => ({
          ...item,
          amountText: Math.abs(item.amount).toFixed(2),
          timeStr: this._formatTime(item.createdAt),
        }));
        this.setData({ logs });
      }
    } catch (e) {
      console.error('[balance] loadLogs failed', e);
    }
  },

  onSelectAmount(e) {
    this.setData({ selectedAmount: e.currentTarget.dataset.amount });
  },

  async onRecharge() {
    if (this.data.recharging) return;

    const option = this.data.rechargeOptions.find(o => o.amount === this.data.selectedAmount);
    if (!option) return;

    const totalAmount = option.amount + option.gift;
    const confirmContent = option.gift > 0
      ? `确认充值 ${option.amount} 元，赠送 ${option.gift} 元，到账 ${totalAmount} 元？`
      : `确认充值 ${option.amount} 元？`;

    wx.showModal({
      title: '确认充值',
      content: confirmContent,
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ recharging: true });

        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: {
              action: 'recharge',
              amount: option.amount,
              gift: option.gift,
            },
          });

          this.setData({ recharging: false });

          if (result.result.success) {
            this.setData({ balance: result.result.balance.toFixed(2) });
            wx.showToast({ title: '充值成功', icon: 'success' });
            this.loadLogs();
          } else {
            wx.showToast({ title: result.result.msg || '充值失败', icon: 'none' });
          }
        } catch (e) {
          console.error('[balance] onRecharge failed', e);
          this.setData({ recharging: false });
          wx.showToast({ title: '充值失败', icon: 'none' });
        }
      },
    });
  },

  _formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },
});
