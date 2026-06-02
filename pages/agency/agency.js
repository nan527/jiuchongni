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
    previewPets: [],
    pendingPreview: [],
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
        } catch (e) { /* 查询失败则使用缓存 */ }
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

    // 在养宠物数 + 前6个预览
    db.collection('user_orders')
      .where({ orderType: 'agency', agencyProfileId: pid, category: 'foster', orderStatus: _.in(['confirmed', 'in_progress']) })
      .orderBy('createTime', 'desc')
      .limit(6)
      .get()
      .then(r => {
        const orders = r.data || [];
        this.setData({ petCount: orders.length });
        const previewPets = orders.map(o => ({
          _id: o._id,
          name: o.petName || '未命名',
          image: (o.petInfo && o.petInfo.photo) || '',
          species: (o.petInfo && o.petInfo.species) || '',
        }));
        this.setData({ previewPets });
      })
      .catch(() => {});

    // 待接单预览（前3条）
    db.collection('user_orders')
      .where({ orderType: 'agency', agencyProfileId: pid, orderStatus: 'pending' })
      .orderBy('createTime', 'desc')
      .limit(3)
      .get()
      .then(r => {
        const items = (r.data || []).map(o => ({
          _id: o._id,
          petName: o.petName || '未命名',
          serviceName: o.serviceName || '寄养服务',
          price: o.price,
          unit: o.unit || '',
          createTimeStr: this._formatDate(o.createTime),
          image: (o.petInfo && o.petInfo.photo) || (o.images && o.images[0]) || '',
        }));
        this.setData({ pendingPreview: items });
      })
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

  _formatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  },
});
