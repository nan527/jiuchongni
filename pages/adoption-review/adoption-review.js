// pages/adoption-review/adoption-review.js
const authService = require('../../services/authService');

Page({
  data: {
    postId: '',
    postType: '',
    postDetail: null,
    applications: [],
    loading: true,
    processingId: '',
  },

  _userId: '',

  async onLoad(options) {
    const { id, type } = options;
    if (!id || !type) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ postId: id, postType: type });
    wx.setNavigationBarTitle({ title: type === 'foster' ? '寄养申请管理' : '领养申请管理' });

    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    await this._loadAll();
  },

  async _loadAll() {
    this.setData({ loading: true });
    try {
      await Promise.all([this._loadPost(), this._loadApplications()]);
    } catch (e) {
      console.error('[AdoptionReview] load', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async _loadPost() {
    try {
      const db = wx.cloud.database();
      const collection = this.data.postType === 'foster' ? 'fosters' : 'adoptions';
      const res = await db.collection(collection).doc(this.data.postId).get();
      this.setData({ postDetail: res.data });
    } catch (e) {
      console.error('[AdoptionReview] loadPost', e);
    }
  },

  async _loadApplications() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('foster_applications')
        .where({ postId: this.data.postId })
        .orderBy('applyTime', 'desc')
        .get();

      const applications = (res.data || []).map(app => ({
        ...app,
        applyTimeStr: this._formatTime(app.applyTime),
      }));
      this.setData({ applications });
    } catch (e) {
      console.error('[AdoptionReview] loadApplications', e);
    }
  },

  _formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  // ===== 通过申请 =====
  onApprove(e) {
    const appId = e.currentTarget.dataset.id;
    if (this.data.processingId) return;
    wx.showModal({
      title: '确认通过',
      content: '通过该申请后，其他申请将自动拒绝，帖子状态将变为"已匹配"。',
      success: async (res) => {
        if (!res.confirm) return;
        await this._processApproval(appId);
      },
    });
  },

  async _processApproval(approvedId) {
    if (this.data.processingId) return;
    this.setData({ processingId: approvedId });

    // 立即更新本地状态，UI 即时响应
    const updatedApps = this.data.applications.map(app => {
      if (app._id === approvedId) return { ...app, applyStatus: 'approved' };
      if (app.applyStatus === 'pending') return { ...app, applyStatus: 'rejected' };
      return app;
    });
    this.setData({ applications: updatedApps });

    wx.showLoading({ title: '处理中...' });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const approvedApp = this.data.applications.find(a => a._id === approvedId);
      if (!approvedApp) throw new Error('申请记录不存在');

      const postType = this.data.postType;
      const collection = postType === 'foster' ? 'fosters' : 'adoptions';
      const applicantId = approvedApp.ownerId;

      // 1. 通过当前申请
      await db.collection('foster_applications').doc(approvedId).update({
        data: { applyStatus: 'approved', approveTime: db.serverDate() },
      });

      // 2. 拒绝其他待审核申请
      const otherPending = this.data.applications.filter(
        a => a._id !== approvedId && a.applyStatus === 'rejected'
      );
      for (const app of otherPending) {
        try {
          await db.collection('foster_applications').doc(app._id).update({
            data: { applyStatus: 'rejected' },
          });
        } catch (e) { /* ignore */ }
      }

      // 3. 更新帖子状态
      await db.collection(collection).doc(this.data.postId).update({
        data: { status: 'matched' },
      });

      // 4. 更新宠物状态
      const petId = this.data.postDetail.petId;
      if (petId) {
        if (postType === 'adopt') {
          await db.collection('pets').doc(petId).update({
            data: { ownerId: applicantId, petStatus: 'adopted_in' },
          });
        } else {
          await db.collection('pets').doc(petId).update({
            data: { petStatus: 'other_foster' },
          });
        }
      }

      // 5. 更新对应的 user_orders 状态
      try {
        const orderRes = await db.collection('user_orders')
          .where({ postId: this.data.postId, ownerId: applicantId, orderType: 'personal' })
          .get();
        if (orderRes.data && orderRes.data.length > 0) {
          await db.collection('user_orders').doc(orderRes.data[0]._id).update({
            data: { orderStatus: 'confirmed' },
          });
        }
      } catch (e) { /* ignore */ }

      // 6. 其他申请的订单 -> cancelled
      for (const app of otherPending) {
        try {
          const orderRes = await db.collection('user_orders')
            .where({ postId: this.data.postId, ownerId: app.ownerId, orderType: 'personal' })
            .get();
          if (orderRes.data && orderRes.data.length > 0) {
            await db.collection('user_orders').doc(orderRes.data[0]._id).update({
              data: { orderStatus: 'cancelled' },
            });
          }
        } catch (e) { /* ignore */ }
      }

      wx.hideLoading();
      wx.showToast({ title: '已通过', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[AdoptionReview] approve', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
      // 失败时重新加载恢复正确状态
      await this._loadApplications();
    } finally {
      this.setData({ processingId: '' });
    }
  },

  // ===== 拒绝申请 =====
  onReject(e) {
    const appId = e.currentTarget.dataset.id;
    if (this.data.processingId) return;
    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝该申请？',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ processingId: appId });

        // 立即更新本地状态
        const updatedApps = this.data.applications.map(app =>
          app._id === appId ? { ...app, applyStatus: 'rejected' } : app
        );
        this.setData({ applications: updatedApps });

        try {
          const db = wx.cloud.database();
          await db.collection('foster_applications').doc(appId).update({
            data: { applyStatus: 'rejected' },
          });
          const app = this.data.applications.find(a => a._id === appId);
          if (app) {
            try {
              const orderRes = await db.collection('user_orders')
                .where({ postId: this.data.postId, ownerId: app.ownerId, orderType: 'personal' })
                .get();
              if (orderRes.data && orderRes.data.length > 0) {
                await db.collection('user_orders').doc(orderRes.data[0]._id).update({
                  data: { orderStatus: 'cancelled' },
                });
              }
            } catch (e) { /* ignore */ }
          }
          wx.showToast({ title: '已拒绝', icon: 'success' });
        } catch (e) {
          console.error('[AdoptionReview] reject', e);
          wx.showToast({ title: '操作失败', icon: 'none' });
          await this._loadApplications();
        } finally {
          this.setData({ processingId: '' });
        }
      },
    });
  },
});
