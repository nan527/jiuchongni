// pages/foster-center/foster-center.js
const authService = require('../../services/authService');

const FILTER_TAB0 = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '进行中' },
  { key: 'matched', label: '已匹配' },
  { key: 'completed', label: '已完成' },
  { key: 'closed', label: '已关闭' },
];

const FILTER_TAB1 = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '申请中' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

const FILTER_TAB2 = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待寄养' },
  { key: 'active', label: '寄养中' },
  { key: 'to_confirm', label: '待取回' },
  { key: 'completed', label: '已取回' },
];

Page({
  data: {
    activeTab: 0,
    activeFilter: 'all',
    filterList: FILTER_TAB0,
    // 我的发布
    publishList: [],
    filteredPublishList: [],
    publishLoading: true,
    // 我参与的
    joinList: [],
    filteredJoinList: [],
    joinLoading: true,
    // 机构订单
    orderList: [],
    filteredOrderList: [],
    orderLoading: true,
  },

  async onShow() {
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._userId = userInfo._id;
      this.loadPublish();
      this.loadJoined();
      this.loadOrders();
    } catch (e) {
      console.warn('[FosterCenter] onShow', e);
    }
  },

  onTabChange(e) {
    const tabIndex = e.detail.index;
    const filterMap = [FILTER_TAB0, FILTER_TAB1, FILTER_TAB2];
    this.setData({
      activeTab: tabIndex,
      activeFilter: 'all',
      filterList: filterMap[tabIndex],
    });
    this.applyFilter();
  },

  onFilterChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this.applyFilter();
  },

  applyFilter() {
    const { activeTab, activeFilter, publishList, joinList, orderList } = this.data;

    if (activeTab === 0) {
      if (activeFilter === 'all') {
        this.setData({ filteredPublishList: publishList });
      } else {
        this.setData({ filteredPublishList: publishList.filter(item => item.status === activeFilter) });
      }
    } else if (activeTab === 1) {
      if (activeFilter === 'all') {
        this.setData({ filteredJoinList: joinList });
      } else {
        this.setData({ filteredJoinList: joinList.filter(item => item.applyStatus === activeFilter) });
      }
    } else if (activeTab === 2) {
      if (activeFilter === 'all') {
        this.setData({ filteredOrderList: orderList });
      } else if (activeFilter === 'active') {
        this.setData({ filteredOrderList: orderList.filter(item => item.orderStatus === 'confirmed' || item.orderStatus === 'in_progress') });
      } else {
        this.setData({ filteredOrderList: orderList.filter(item => item.orderStatus === activeFilter) });
      }
    }
  },

  // ====== Tab 1: 我的发布 ======
  async loadPublish() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ publishList: [], publishLoading: false });
      return;
    }
    this.setData({ publishLoading: true });
    const db = wx.cloud.database();
    let list = [];

    try {
      const fRes = await db.collection('fosters').where({ ownerId: userId }).orderBy('createTime', 'desc').limit(20).get();
      list = list.concat((fRes.data || []).filter(d => d.ownerId === userId).map(d => ({ ...d, type: 'foster' })));
    } catch (e) { /* ignore */ }

    try {
      const aRes = await db.collection('adoptions').where({ ownerId: userId }).orderBy('createTime', 'desc').limit(20).get();
      list = list.concat((aRes.data || []).filter(d => d.ownerId === userId).map(d => ({ ...d, type: 'adopt' })));
    } catch (e) { /* ignore */ }

    list.sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0;
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0;
      return tb - ta;
    });

    list = list.map(item => ({ ...item, createTimeStr: this._formatTime(item.createTime), pendingCount: 0 }));

    // 加载每个帖子的待审核申请数
    for (const item of list) {
      try {
        const countRes = await db.collection('foster_applications')
          .where({ postId: item._id, applyStatus: 'pending' })
          .count();
        item.pendingCount = countRes.total || 0;
      } catch (e) { /* ignore */ }
    }

    this.setData({ publishList: list, publishLoading: false });
    this.applyFilter();
  },

  // ====== Tab 2: 我参与的 ======
  async loadJoined() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ joinList: [], joinLoading: false });
      return;
    }
    this.setData({ joinLoading: true });
    const db = wx.cloud.database();
    let list = [];

    try {
      const res = await db.collection('foster_applications').where({ ownerId: userId }).orderBy('applyTime', 'desc').limit(20).get();
      list = (res.data || []).filter(item => item.ownerId === userId).map(item => ({ ...item, applyTimeStr: this._formatTime(item.applyTime), posterContact: '', posterPhone: '' }));
    } catch (e) { /* collection may not exist yet */ }

    // 已通过的申请加载发布者联系方式
    for (const item of list) {
      if (item.applyStatus === 'approved' && item.postId) {
        try {
          const col = item.applyType === 'foster' ? 'fosters' : 'adoptions';
          const postRes = await db.collection(col).doc(item.postId).get();
          if (postRes.data) {
            item.posterContact = postRes.data.contactName || '';
            item.posterPhone = postRes.data.contactPhone || '';
          }
        } catch (e) { /* post may have been deleted */ }
      }
    }

    this.setData({ joinList: list, joinLoading: false });
    this.applyFilter();
  },

  // ====== Tab 3: 机构订单 ======
  async loadOrders() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ orderList: [], orderLoading: false });
      return;
    }
    this.setData({ orderLoading: true });
    const db = wx.cloud.database();
    let list = [];

    try {
      const res = await db.collection('agency_orders').where({ ownerId: userId }).orderBy('createTime', 'desc').limit(20).get();
      list = (res.data || []).filter(item => item.ownerId === userId).map(item => ({
        ...item,
        dateRange: item.startDate && item.endDate ? `${item.startDate} ~ ${item.endDate}` : '',
      }));
    } catch (e) { /* collection may not exist yet */ }

    this.setData({ orderList: list, orderLoading: false });
    this.applyFilter();
  },

  onPublishTap(e) {
    const { id, type } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/foster-detail/foster-detail?id=${id}&type=${type}` });
  },

  onReviewTap(e) {
    const { id, type } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/adoption-review/adoption-review?id=${id}&type=${type}` });
  },

  onJoinTap(e) {
    const { id, type } = e.currentTarget.dataset;
    if (id && type) {
      wx.navigateTo({ url: `/pages/foster-detail/foster-detail?id=${id}&type=${type}` });
    }
  },

  toPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
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
});
