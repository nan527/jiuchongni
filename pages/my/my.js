// pages/my/my.js
const authService = require('../../services/authService');
const db = wx.cloud.database();

const SEEN_STORAGE_KEY = 'my_order_seen_counts';

Page({
  data: {
    userInfo: null,
    roleName: '宠主',
    nickname: '未登录',
    // 统计数据
    petCount: 0,
    orderCount: 0,
    postCount: 0,
    // 订单状态数量
    pendingCount: 0,
    inProgressCount: 0,
    toConfirmCount: 0,
    completedCount: 0,
    // 新消息红点
    pendingNew: false,
    inProgressNew: false,
    toConfirmNew: false,
    completedNew: false,
    loading: true,
  },

  onLoad() {
    this._loadLastSeen();
  },

  _loadLastSeen() {
    this._lastSeen = { pending: 0, in_progress: 0, to_confirm: 0, completed: 0 };
    try {
      const saved = wx.getStorageSync(SEEN_STORAGE_KEY);
      if (saved) this._lastSeen = saved;
    } catch (e) { /* ignore */ }
  },

  _saveLastSeen() {
    try {
      wx.setStorageSync(SEEN_STORAGE_KEY, this._lastSeen);
    } catch (e) { /* ignore */ }
  },

  _updateBadges() {
    const seen = this._lastSeen || { pending: 0, in_progress: 0, to_confirm: 0, completed: 0 };
    this.setData({
      pendingNew: this.data.pendingCount > (seen.pending || 0),
      inProgressNew: this.data.inProgressCount > (seen.in_progress || 0),
      toConfirmNew: this.data.toConfirmCount > (seen.to_confirm || 0),
      completedNew: this.data.completedCount > (seen.completed || 0),
    });
  },

  async onShow() {
    this._loadLastSeen();
    try {
      const userInfo = await authService.checkLogin();
      if (userInfo) {
        const roleInfo = authService.getRoleInfo(userInfo.role);
        this._userId = userInfo._id;
        this.setData({
          userInfo,
          roleName: roleInfo.label,
          nickname: userInfo.nickname || roleInfo.label,
        });
        this.loadStats();
      } else {
        this.setData({
          userInfo: null,
          roleName: '宠主',
          nickname: '未登录',
          loading: false,
          petCount: 0,
          orderCount: 0,
          postCount: 0,
          pendingCount: 0,
          inProgressCount: 0,
          toConfirmCount: 0,
          completedCount: 0,
          pendingNew: false,
          inProgressNew: false,
          toConfirmNew: false,
          completedNew: false,
        });
      }
    } catch (err) {
      console.warn('[My] onShow checkLogin 异常', err);
      this.setData({
        userInfo: null,
        roleName: '宠主',
        nickname: '未登录',
        loading: false,
      });
    }
  },

  async loadStats() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ loading: false });
      return;
    }
    try {
      const [petsRes, ordersRes, postsRes, pendingRes, inProgressRes, toConfirmRes, completedRes] =
        await Promise.all([
          db.collection('pets').where({ ownerId: userId }).count(),
          db.collection('user_orders').where({ ownerId: userId }).count(),
          db.collection('posts').where({ ownerId: userId }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'pending' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'in_progress' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'to_confirm' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'completed' }).count(),
        ]);

      this.setData({
        petCount: petsRes.total,
        orderCount: ordersRes.total,
        postCount: postsRes.total,
        pendingCount: pendingRes.total,
        inProgressCount: inProgressRes.total,
        toConfirmCount: toConfirmRes.total,
        completedCount: completedRes.total,
        loading: false,
      });

      this._updateBadges();
    } catch (err) {
      console.warn('[My] loadStats 异常', err);
      this.setData({ loading: false });
    }
  },

  handleLogin() {
    if (!this.data.userInfo) {
      wx.navigateTo({ url: '/pages/login/login' });
    }
  },

  handleHeaderTap() {
    if (this.data.userInfo) {
      this.toProfile();
    } else {
      this.handleLogin();
    }
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          authService.logout();
          this.setData({
            userInfo: null,
            roleName: '宠主',
            nickname: '未登录',
            petCount: 0,
            orderCount: 0,
            postCount: 0,
            pendingCount: 0,
            inProgressCount: 0,
            toConfirmCount: 0,
            completedCount: 0,
          });
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      },
    });
  },

  toProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  toFosterCenter() {
    wx.navigateTo({ url: '/pages/foster-center/foster-center' });
  },

  toOrders(e) {
    const status = e.currentTarget.dataset.status;
    // 标记该状态为已读（active 对应 in_progress）
    const seenKey = status === 'active' ? 'in_progress' : status;
    const seen = this._lastSeen || {};
    if (seenKey && seen.hasOwnProperty(seenKey)) {
      const countMap = { pending: 'pendingCount', in_progress: 'inProgressCount', to_confirm: 'toConfirmCount', completed: 'completedCount' };
      seen[seenKey] = this.data[countMap[seenKey]] || 0;
      this._lastSeen = seen;
      this._saveLastSeen();
      this._updateBadges();
    }
    if (status) {
      wx.navigateTo({ url: '/pages/orders/orders?status=' + status });
    } else {
      wx.navigateTo({ url: '/pages/orders/orders' });
    }
  },

  toHealthRemind() {
    wx.navigateTo({ url: '/pages/health/health' });
  },

  toForum() {
    wx.switchTab({ url: '/pages/forum/forum' });
  },

  toMyPosts() {
    wx.navigateTo({ url: '/pages/forum/forum?tab=mine' });
  },

  toAdminPanel() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  toCustomerService() {
    wx.makePhoneCall({
      phoneNumber: '400-888-8888',
      fail: () => {},
    });
  },
});
