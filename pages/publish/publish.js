// pages/publish/publish.js
const db = wx.cloud.database();

Page({
  data: {
    listingList: [],
    loading: true,
  },

  onShow() {
    this.loadListings();
  },

  async loadListings() {
    this.setData({ loading: true });
    let list = [];

    try {
      const [fosterRes, adoptRes] = await Promise.all([
        db.collection('fosters').where({ status: 'open' }).orderBy('createTime', 'desc').limit(10).get(),
        db.collection('adoptions').where({ status: 'open' }).orderBy('createTime', 'desc').limit(10).get(),
      ]);

      list = list.concat(
        (fosterRes.data || []).map(d => ({ ...d, type: 'foster' })),
        (adoptRes.data || []).map(d => ({ ...d, type: 'adopt' }))
      );

      // 按时间排序
      list.sort((a, b) => {
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0;
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0;
        return tb - ta;
      });

      // 只取前 10 条
      list = list.slice(0, 10).map(item => ({
        ...item,
        createTimeStr: this._formatTime(item.createTime),
      }));
    } catch (e) {
      console.warn('[Publish] loadListings', e);
    }

    this.setData({ listingList: list, loading: false });
  },

  onListingTap(e) {
    const { id, type } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/foster-detail/foster-detail?id=${id}&type=${type}` });
  },

  toCreatePost() {
    wx.navigateTo({ url: '/pages/post/post' });
  },

  toAdopt() {
    wx.navigateTo({ url: '/pages/adopt/adopt' });
  },

  toFoster() {
    wx.navigateTo({ url: '/pages/foster/foster' });
  },

  toFosterCenter() {
    wx.navigateTo({ url: '/pages/foster-center/foster-center' });
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
