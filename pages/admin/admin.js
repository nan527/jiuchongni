// pages/admin/admin.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    loading: true,
    totalCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showToast({ title: '请先以管理员身份登录', icon: 'none' });
      setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 600);
      return;
    }
    this.loadStats();
  },

  async loadStats() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;
    try {
      const [totalRes, approvedRes, pendingRes] = await Promise.all([
        db.collection('agency_profiles').count().catch(() => ({ total: 0 })),
        db.collection('agency_profiles').where({ auditStatus: 'approved' }).count().catch(() => ({ total: 0 })),
        db.collection('agency_profiles').where({ auditStatus: _.in(['pending', 'rejected']) }).count().catch(() => ({ total: 0 })),
      ]);
      this.setData({
        totalCount: totalRes.total || 0,
        pendingCount: pendingRes.total || 0,
        approvedCount: approvedRes.total || 0,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  toAudit() {
    wx.navigateTo({ url: '/pages/admin/audit' });
  },

  toAgencies() {
    wx.navigateTo({ url: '/pages/admin/agencies' });
  },

  toDashboard() {
    wx.navigateTo({ url: '/pages/admin/dashboard' });
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          authService.logout();
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => {
            wx.redirectTo({ url: '/pages/login/login' });
          }, 800);
        }
      },
    });
  },
});
