// pages/agency/agency.js
const authService = require('../../services/authService');

Page({
  data: {
    agencyInfo: {},
    orderCount: 0,
    petCount: 0,
    serviceCount: 0,
    pendingCount: 0,
    activeCount: 0,
    toConfirmCount: 0,
    completedCount: 0,
    loading: false,
    isLocked: true,
    isRegistered: false,
    auditStatus: '',
    activeTab: 0,
  },

  async onShow() {
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo) return;

      const isRegistered = !!userInfo.agencyProfileId;

      // 直接从数据库获取最新审核状态，避免缓存过期
      let auditStatus = userInfo.auditStatus || '';
      if (isRegistered && userInfo._id) {
        try {
          const db = wx.cloud.database();
          const fresh = await db.collection('users').doc(userInfo._id).get();
          if (fresh.data) {
            auditStatus = fresh.data.auditStatus || auditStatus;
            // 同步更新缓存
            userInfo.auditStatus = auditStatus;
            const STORAGE_KEYS = require('../../constants/index').STORAGE_KEYS;
            wx.setStorageSync(STORAGE_KEYS.USER_INFO, userInfo);
          }
        } catch (e) {
          console.warn('[Agency] 查询审核状态失败，使用缓存值', e);
        }
      }

      const isLocked = !isRegistered || auditStatus !== 'approved';
      let displayStatus = isRegistered ? auditStatus : 'unregistered';
      this.setData({ agencyInfo: userInfo, isRegistered, auditStatus: displayStatus, isLocked });
      if (!isLocked) {
        this.loadStats(userInfo);
      }
    } catch (err) {
      console.warn('[Agency] onShow 异常', err);
    }
  },

  loadStats(userInfo) {
    const db = wx.cloud.database();
    const pid = userInfo && userInfo.agencyProfileId;
    if (!pid) return;
    const _ = db.command;

    // 总订单数
    db.collection('user_orders')
      .where({ orderType: 'agency', agencyProfileId: pid })
      .count()
      .then(r => this.setData({ orderCount: r.total || 0 }))
      .catch(() => {});

    // 各状态订单数
    const statusQueries = {
      pendingCount: { orderStatus: 'pending' },
      activeCount: { orderStatus: _.in(['confirmed', 'in_progress']) },
      toConfirmCount: { orderStatus: 'to_confirm' },
      completedCount: { orderStatus: 'completed' },
    };
    Object.entries(statusQueries).forEach(([key, cond]) => {
      db.collection('user_orders')
        .where({ orderType: 'agency', agencyProfileId: pid, ...cond })
        .count()
        .then(r => this.setData({ [key]: r.total || 0 }))
        .catch(() => {});
    });

    // 服务项目数
    db.collection('agency_services').where({ agencyProfileId: pid }).count()
      .then(r => this.setData({ serviceCount: r.total || 0 }))
      .catch(() => {});

    // 在养宠物数
    db.collection('user_orders')
      .where({ orderType: 'agency', agencyProfileId: pid, category: 'foster', orderStatus: _.in(['confirmed', 'in_progress']) })
      .count()
      .then(r => this.setData({ petCount: r.total || 0 }))
      .catch(() => {});
  },

  // ====== 底部标签切换 ======
  onTabChange(e) {
    this.setData({ activeTab: e.detail });
  },

  // ====== 注册入口 ======
  toRegister() {
    wx.navigateTo({ url: '/pages/agency-register/agency-register' });
  },

  // ====== 运营管理 ======
  toOpsOrders() {
    wx.navigateTo({ url: '/pages/agency-orders/agency-orders' });
  },

  toOpsReview() {
    wx.navigateTo({ url: '/pages/agency-reviews/agency-reviews' });
  },

  toOpsRevenue() {
    wx.navigateTo({ url: '/pages/agency-revenue/agency-revenue' });
  },

  toOpsExposure() {
    wx.showToast({ title: '曝光引流开发中', icon: 'none' });
  },

  toEditInfo() {
    wx.navigateTo({ url: '/pages/agency-edit/agency-edit' });
  },

  // ====== 快捷功能 ======
  toPetManage() {
    wx.navigateTo({ url: '/pages/agency-pets/agency-pets' });
  },

  toServiceManage() {
    wx.navigateTo({ url: '/pages/agency-services/agency-services' });
  },

  toFosterRequests() {
    wx.navigateTo({ url: '/pages/agency-posts/agency-posts' });
  },

  toContact() {
    wx.showToast({ title: '客服中心开发中', icon: 'none' });
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
