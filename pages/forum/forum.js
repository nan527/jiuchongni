// pages/forum/forum.js
const authService = require('../../services/authService');

Page({
  data: {
    tab: 'all',      // 'all' | 'mine'
    postList: [],
    loading: true,
    likedPosts: {},   // 已点赞的帖子ID集合
  },

  onLoad(options) {
    if (options.tab === 'mine') {
      this.setData({ tab: 'mine' });
    }
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    this._userId = userInfo ? userInfo._id : '';
    this.loadPosts();
  },

  /** 切换 tab */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.loadPosts();
  },

  /** 加载帖子列表 */
  async loadPosts() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      let query = db.collection('posts').orderBy('createTime', 'desc').limit(50);

      if (this.data.tab === 'mine' && this._userId) {
        query = query.where({ ownerId: this._userId });
      }

      const res = await query.get();
      let postList = res.data || [];
      // 安全兜底：JavaScript 过滤
      if (this.data.tab === 'mine' && this._userId) {
        postList = postList.filter(p => p.ownerId === this._userId);
      }

      // 记录当前用户已点赞的帖子
      const likedPosts = {};
      if (this._userId) {
        postList.forEach(p => {
          if (p.likedBy && p.likedBy.includes(this._userId)) {
            likedPosts[p._id] = true;
          }
        });
      }

      this.setData({ postList, likedPosts, loading: false });
    } catch (err) {
      console.error('[Forum] 加载帖子失败', err);
      this.setData({ loading: false });
    }
  },

  /** 跳转到发帖页 */
  toCreatePost() {
    wx.navigateTo({ url: '/pages/post/post' });
  },

  /** 点击帖子跳转详情 */
  onPostTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` });
  },

  /** 点赞 */
  async onLike(e) {
    const id = e.currentTarget.dataset.id;
    const idx = this.data.postList.findIndex(p => p._id === id);
    if (idx < 0) return;

    // 防止重复点赞
    if (this.data.likedPosts[id]) {
      wx.showToast({ title: '已点赞过', icon: 'none' });
      return;
    }
    if (!this._userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const db = wx.cloud.database();
      await db.collection('posts').doc(id).update({
        data: {
          likeCount: db.command.inc(1),
          likedBy: db.command.addToSet(this._userId),
        },
      });
      const key = `postList[${idx}].likeCount`;
      const likedKey = `likedPosts.${id}`;
      this.setData({
        [key]: (this.data.postList[idx].likeCount || 0) + 1,
        [likedKey]: true,
      });
    } catch (err) {
      console.warn('[Forum] 点赞失败', err);
    }
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },
});
