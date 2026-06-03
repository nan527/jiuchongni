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
    // 订单状态数量
    unpaidCount: 0,
    pendingCount: 0,
    toConfirmCount: 0,
    toReviewCount: 0,
    // 新消息红点
    unpaidNew: false,
    pendingNew: false,
    toConfirmNew: false,
    toReviewNew: false,
    loading: true,
    // 导航栏
    statusBarHeight: 0,
    navBarHeight: 0,
    // 宠物档案卡片
    firstPet: null,
    petLoading: false,
    // 健康概览卡片
    healthLoading: false,
    healthBrief: {
      latestWeight: '',
      weightTrend: '',
      lastVaccine: '',
      lastDeworming: '',
      reminders: [],
    },
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this._loadLastSeen();
  },

  _loadLastSeen() {
    this._lastSeen = { unpaid: 0, pending: 0, to_confirm: 0, to_review: 0 };
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
    const seen = this._lastSeen || { unpaid: 0, pending: 0, to_confirm: 0, to_review: 0 };
    this.setData({
      unpaidNew: this.data.unpaidCount > (seen.unpaid || 0),
      pendingNew: this.data.pendingCount > (seen.pending || 0),
      toConfirmNew: this.data.toConfirmCount > (seen.to_confirm || 0),
      toReviewNew: this.data.toReviewCount > (seen.to_review || 0),
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
          unpaidCount: 0,
          pendingCount: 0,
          toConfirmCount: 0,
          toReviewCount: 0,
          unpaidNew: false,
          pendingNew: false,
          toConfirmNew: false,
          toReviewNew: false,
          firstPet: null,
          healthBrief: { latestWeight: '', weightTrend: '', lastVaccine: '', lastDeworming: '', reminders: [] },
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
      const [petsRes, ordersRes, unpaidRes, pendingRes, toConfirmRes, toReviewRes] =
        await Promise.all([
          db.collection('pets').where({ ownerId: userId }).count(),
          db.collection('user_orders').where({ ownerId: userId }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'unpaid' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'pending' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'to_confirm' }).count(),
          db.collection('user_orders').where({ ownerId: userId, orderStatus: 'completed', review: db.command.exists(false) }).count(),
        ]);

      this.setData({
        petCount: petsRes.total,
        orderCount: ordersRes.total,
        unpaidCount: unpaidRes.total,
        pendingCount: pendingRes.total,
        toConfirmCount: toConfirmRes.total,
        toReviewCount: toReviewRes.total,
        loading: false,
      });

      this._updateBadges();

      // 加载宠物档案和健康概览
      this.loadFirstPet();
    } catch (err) {
      console.warn('[My] loadStats 异常', err);
      this.setData({ loading: false });
    }
  },

  async loadFirstPet() {
    const userId = this._userId;
    if (!userId) return;
    this.setData({ petLoading: true });
    try {
      const res = await db.collection('pets')
        .where({ ownerId: userId })
        .orderBy('createTime', 'desc')
        .get();
      const STATUS_MAP = {
        agency_foster: { label: '寄养中', color: '#FF9800', bg: '#FFF3E0' },
        pending_foster: { label: '待寄养', color: '#E65100', bg: '#FFF3E0' },
        waiting_pickup: { label: '待取回', color: '#EF6C00', bg: '#FFF8E1' },
        other_foster: { label: '他人寄养', color: '#1565C0', bg: '#E3F2FD' },
      };
      const petList = (res.data || []).map(p => {
        const sc = STATUS_MAP[p.petStatus];
        return {
          ...p,
          statusLabel: sc ? sc.label : '',
          statusColor: sc ? sc.color : '',
          statusBg: sc ? sc.bg : '',
        };
      });
      // 优先展示用户设置的展示宠物
      const displayPetId = this.data.userInfo && this.data.userInfo.displayPetId;
      let firstPet;
      if (displayPetId) {
        firstPet = petList.find(p => p._id === displayPetId) || petList[0] || null;
      } else {
        firstPet = petList[0] || null;
      }
      this.setData({ firstPet, petLoading: false });
      if (firstPet) this.loadHealthBrief(firstPet._id);
    } catch (err) {
      console.warn('[My] loadFirstPet 异常', err);
      this.setData({ petLoading: false });
    }
  },

  async loadHealthBrief(petId) {
    this.setData({ healthLoading: true });
    try {
      const res = await db.collection('health_records')
        .where({ pet_id: petId })
        .orderBy('record_date', 'desc')
        .limit(50)
        .get();
      const records = res.data || [];

      const weightRecords = records.filter(r => r.type === 'weight');
      const latestWeight = weightRecords.length > 0 ? weightRecords[0].value : '';
      let weightTrend = '';
      if (weightRecords.length >= 2) {
        const diff = parseFloat(weightRecords[0].value) - parseFloat(weightRecords[1].value);
        if (diff > 0.05) weightTrend = 'up';
        else if (diff < -0.05) weightTrend = 'down';
      }

      const vaccineRecords = records.filter(r => r.type === 'vaccine');
      const dewormingRecords = records.filter(r => r.type === 'deworming');
      const lastVaccine = vaccineRecords.length > 0 ? this._formatDate(vaccineRecords[0].record_date) : '';
      const lastDeworming = dewormingRecords.length > 0 ? this._formatDate(dewormingRecords[0].record_date) : '';

      const reminders = [];
      const now = new Date();
      if (vaccineRecords.length > 0) {
        const dueDate = new Date(new Date(vaccineRecords[0].record_date).getTime() + 90 * 86400000);
        const daysLeft = Math.ceil((dueDate - now) / 86400000);
        if (daysLeft <= 14) {
          reminders.push({
            title: daysLeft <= 0 ? '疫苗已过期，请尽快接种' : `疫苗即将到期（${daysLeft}天后）`,
            isOverdue: daysLeft <= 0,
          });
        }
      }
      if (dewormingRecords.length > 0) {
        const dueDate = new Date(new Date(dewormingRecords[0].record_date).getTime() + 30 * 86400000);
        const daysLeft = Math.ceil((dueDate - now) / 86400000);
        if (daysLeft <= 7) {
          reminders.push({
            title: daysLeft <= 0 ? '驱虫已过期，请尽快处理' : `驱虫即将到期（${daysLeft}天后）`,
            isOverdue: daysLeft <= 0,
          });
        }
      }

      this.setData({
        healthLoading: false,
        healthBrief: { latestWeight, weightTrend, lastVaccine, lastDeworming, reminders },
      });
    } catch (err) {
      console.warn('[My] loadHealthBrief 异常', err);
      this.setData({ healthLoading: false });
    }
  },

  _formatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
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
            unpaidCount: 0,
            pendingCount: 0,
            toConfirmCount: 0,
            toReviewCount: 0,
            firstPet: null,
            healthBrief: { latestWeight: '', weightTrend: '', lastVaccine: '', lastDeworming: '', reminders: [] },
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

  onPetTap(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/pet-detail/pet-detail?id=${id}` });
    }
  },

  toOrders(e) {
    const status = e.currentTarget.dataset.status;
    const seen = this._lastSeen || {};
    if (status && seen.hasOwnProperty(status)) {
      const countMap = { unpaid: 'unpaidCount', pending: 'pendingCount', to_confirm: 'toConfirmCount', to_review: 'toReviewCount' };
      seen[status] = this.data[countMap[status]] || 0;
      this._lastSeen = seen;
      this._saveLastSeen();
      this._updateBadges();
    }
    // 订单页已是 tab 页，使用 switchTab
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  toHealthRemind() {
    wx.navigateTo({ url: '/pages/health/health' });
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
