// pages/agency-posts/agency-posts.js
const authService = require('../../services/authService');

Page({
  data: {
    activeTab: 'foster',
    loading: true,
    postList: [],
    fosterCount: 0,
    adoptCount: 0,
  },

  _agencyProfileId: '',
  _agencyUserInfo: null,
  _fosterList: [],
  _adoptList: [],

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    if (!userInfo.agencyProfileId) {
      wx.showToast({ title: '请先注册机构', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._agencyProfileId = userInfo.agencyProfileId;
    this._agencyUserInfo = userInfo;
    this.loadPosts();
  },

  /** 切换 Tab */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this._applyFilter());
  },

  /** 加载所有公开的寄养和领养帖子 */
  async loadPosts() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      const [fosterRes, adoptRes] = await Promise.all([
        db.collection('fosters')
          .where({ status: 'open' })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get(),
        db.collection('adoptions')
          .where({ status: 'open' })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get(),
      ]);

      this._fosterList = fosterRes.data || [];
      this._adoptList = adoptRes.data || [];

      this.setData({
        fosterCount: this._fosterList.length,
        adoptCount: this._adoptList.length,
        loading: false,
      });
      this._applyFilter();
    } catch (err) {
      console.error('[AgencyPosts] loadPosts error', err);
      this.setData({
        postList: [],
        fosterCount: 0,
        adoptCount: 0,
        loading: false,
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 根据当前 Tab 筛选显示列表 */
  _applyFilter() {
    const list = this.data.activeTab === 'foster' ? this._fosterList : this._adoptList;
    this.setData({
      postList: list,
      fosterCount: this._fosterList.length,
      adoptCount: this._adoptList.length,
    });
  },

  /** 接单 */
  onAccept(e) {
    const { id, type } = e.currentTarget.dataset;
    const list = type === 'foster' ? this._fosterList : this._adoptList;
    const post = list.find(p => p._id === id);
    if (!post) return;

    wx.showModal({
      title: '确认接单',
      content: `确认接取「${post.petName}」的${type === 'foster' ? '寄养' : '领养'}需求？`,
      success: async (res) => {
        if (!res.confirm) return;
        await this._acceptOrder(post, type);
      },
    });
  },

  /** 执行接单操作 */
  async _acceptOrder(post, type) {
    wx.showLoading({ title: '接单中...' });

    // 乐观更新：立即从本地列表移除
    const listKey = type === 'foster' ? '_fosterList' : '_adoptList';
    const oldList = [...this[listKey]];
    this[listKey] = this[listKey].filter(p => p._id !== post._id);
    this._applyFilter();

    try {
      const db = wx.cloud.database();
      const now = new Date();
      const checkinDate = post.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // 1. 创建机构订单（通过云函数，绕过安全规则）
      const orderResult = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'create_agency_order',
          agencyProfileId: this._agencyProfileId,
          orderData: {
            ownerId: post.ownerId,
            orderType: 'agency',
            category: type,
            serviceName: type === 'foster' ? '机构寄养接单' : '机构领养接单',
            agencyName: this._agencyUserInfo.nickname || '机构',
            petId: post.petId || '',
            petName: post.petName,
            petInfo: {
              species: post.breed || '',
              age: post.age || '',
              photo: (post.images && post.images[0]) || '',
            },
            images: post.images || [],
            phone: (this._agencyUserInfo.phone || '') + '',
            checkinDate: checkinDate,
            leaveTimeMs: post.endDate ? new Date(post.endDate).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000,
          },
        },
      });

      const { success: orderSuccess, msg: orderMsg } = orderResult.result || {};
      if (!orderSuccess) {
        throw new Error(orderMsg || '创建订单失败');
      }

      // 2. 更新帖子状态
      const collection = type === 'foster' ? 'fosters' : 'adoptions';
      await db.collection(collection).doc(post._id).update({
        data: { status: 'matched' },
      });

      // 3. 更新宠物状态
      if (post.petId) {
        try {
          await db.collection('pets').doc(post.petId).update({
            data: { petStatus: 'agency_foster', updateTime: db.serverDate() },
          });
        } catch (e) {
          console.warn('[AgencyPosts] update pet status failed', e);
        }
      }

      wx.hideLoading();
      wx.showToast({ title: '接单成功', icon: 'success' });
    } catch (err) {
      // 回滚：恢复列表
      this[listKey] = oldList;
      this._applyFilter();
      wx.hideLoading();
      console.error('[AgencyPosts] accept error', err);
      wx.showToast({ title: '接单失败', icon: 'none' });
    }
  },
});
