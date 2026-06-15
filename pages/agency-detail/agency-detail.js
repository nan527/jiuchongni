// pages/agency-detail/agency-detail.js
const authService = require('../../services/authService');
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');
const { CAT_TITLE_MAP, getStatusBarHeight } = require('../../utils/helpers');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const CAT_LABEL = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

Page({
  data: {
    agency: null,
    svcList: [],
    loading: true,
    svcLoading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
    // 评论相关
    reviews: [],
    reviewLoading: true,
    avgRating: '0.0',
    avgRatingRound: 0,
    totalReviews: 0,
    goodRate: 0,
    showReview: false,
    reviewOrderId: '',
    submittingReview: false,
    canReview: false, // 当前用户是否有未评价的已完成订单
    canReviewOrderId: '',
  },

  onGoBack() {
    wx.navigateBack();
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const { id } = options;
    if (id) {
      this.loadAgency(id);
    }
  },

  async loadAgency(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles').doc(id).get();
      const agencies = await resolveAgencyImages([res.data]);
      const agency = agencies[0];
      this.setData({ agency, loading: false });
      // 用机构 profileId 加载其服务
      this.loadServices(id);
      // 加载评论
      this.loadReviews(id);
      // 检查当前用户是否可以评论
      this.checkCanReview(id);
    } catch (e) {
      this.setData({ agency: null, loading: false, svcLoading: false });
      wx.showToast({ title: '机构信息加载失败', icon: 'none' });
    }
  },

  async loadServices(profileId) {
    this.setData({ svcLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .where({ agencyProfileId: profileId })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();
      const svcList = [];
      for (const s of (res.data || [])) {
        const item = { ...s, catTitle: CAT_TITLE_MAP[s.category] || '服务' };
        if (Array.isArray(item.images) && item.images.length) {
          item.images = await resolveTempUrls(item.images);
        }
        svcList.push(item);
      }
      this.setData({ svcList, svcLoading: false });
    } catch (e) {
      this.setData({ svcList: [], svcLoading: false });
    }
  },

  async loadReviews(agencyProfileId) {
    this.setData({ reviewLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('user_orders')
          .where({
            agencyProfileId,
            orderType: 'agency',
            orderStatus: 'completed',
          })
          .orderBy('review.createTime', 'desc')
          .limit(50)
          .get(),
        8000
      );
      const allReviews = (res.data || []).filter(o => o.review && o.review.rating);
      const reviews = allReviews.map(o => ({
        _id: o._id,
        serviceName: o.serviceName || '未知服务',
        catLabel: CAT_LABEL[o.category] || '其他',
        petName: o.petName || '-',
        rating: o.review.rating,
        content: o.review.content || '',
        reply: o.review.reply || '',
        createTime: o.review.createTime,
        createTimeStr: this._formatTime(o.review.createTime),
        ratingArr: new Array(o.review.rating || 0).fill(1),
      }));

      // 计算统计
      const total = reviews.length;
      let sumRating = 0;
      let goodCount = 0;
      reviews.forEach(r => {
        sumRating += r.rating;
        if (r.rating >= 4) goodCount++;
      });
      const avg = total > 0 ? sumRating / total : 0;

      this.setData({
        reviews,
        reviewLoading: false,
        totalReviews: total,
        avgRating: avg.toFixed(1),
        avgRatingRound: Math.round(avg * 2) / 2,
        goodRate: total > 0 ? Math.round((goodCount / total) * 100) : 0,
      });
    } catch (e) {
      this.setData({ reviews: [], reviewLoading: false });
    }
  },

  async checkCanReview(agencyProfileId) {
    const userInfo = await authService.checkLogin();
    if (!userInfo) return;
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('user_orders')
          .where({
            agencyProfileId,
            ownerId: userInfo._id,
            orderType: 'agency',
            orderStatus: 'completed',
          })
          .get(),
        8000
      );
      const unreviewed = (res.data || []).find(o => !o.review || !o.review.rating);
      if (unreviewed) {
        this.setData({ canReview: true, canReviewOrderId: unreviewed._id });
      }
    } catch (e) { /* ignore */ }
  },

  openReview() {
    if (!this.data.canReview) return;
    this.setData({
      showReview: true,
      reviewOrderId: this.data.canReviewOrderId,
    });
  },

  closeReview() {
    this.setData({ showReview: false, reviewOrderId: '' });
  },

  onCloseReview() {
    this.closeReview();
  },

  async submitReview(e) {
    const { orderId, rating, content } = e.detail;
    if (this.data.submittingReview) return;
    this.setData({ submittingReview: true });

    try {
      const db = wx.cloud.database();
      await withTimeout(
        db.collection('user_orders').doc(orderId).update({
          data: {
            review: { rating: rating, content: content.trim(), createTime: db.serverDate() },
          },
        }),
        8000
      );
      wx.showToast({ title: '评价成功' });
      this.setData({ showReview: false, reviewOrderId: '', canReview: false, canReviewOrderId: '' });
      // 重新加载评论
      this.loadReviews(this.data.agency._id);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
  },

  onSvcTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onPreviewImage(e) {
    const { url, list } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: list || [url] });
  },

  onShareAppMessage() {
    const { agency } = this.data;
    return {
      title: agency ? agency.orgName : '就宠你',
      path: `/pages/agency-detail/agency-detail?id=${agency?._id}`,
    };
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
