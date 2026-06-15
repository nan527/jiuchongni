// pages/service-detail/service-detail.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');
const { CAT_TITLE_MAP, formatDate, getStatusBarHeight } = require('../../utils/helpers');

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
    svc: null,
    catTitle: '服务',
    agencyProfile: null,
    myPets: [],
    selectedPetId: '',
    petName: '',
    phone: '',
    remark: '',
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    today: '',
    checkinDate: '',
    stayDays: 1,
    cageInfo: {
      totalCages: 0,
      occupiedCages: 0,
      availableCages: 0,
      cageDesc: '',
    },
    submitting: false,
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
    canReview: false,
    canReviewOrderId: '',
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    this.setData({ today, checkinDate: today });

    const { id } = options;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('agency_services').doc(id).get();
      const svc = res.data;
      // 保留原始 cloud:// ID 用于存储，临时 URL 仅用于当前页面显示
      const rawImages = Array.isArray(svc.images) ? [...svc.images] : [];
      if (rawImages.length) {
        svc.images = await resolveTempUrls(rawImages);
      }
      this._rawImages = rawImages;
      this.setData({
        svc,
        catTitle: CAT_TITLE_MAP[svc.category] || '服务',
      });
      this.loadAgencyProfile(svc.agencyProfileId || '');
      this.loadAgencyCageInfo(svc.agencyProfileId || '');
      // 加载评论
      this.loadReviews(svc._id);
      this.checkCanReview(svc._id);
      const userInfo = await authService.checkLogin();
      if (userInfo) {
        this.loadMyPets();
      }
    } catch (e) {
      console.error('[ServiceDetail] load', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  previewImg(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      current: src,
      urls: this.data.svc.images || [src],
    });
  },

  async loadMyPets() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('pets').orderBy('createTime', 'desc').get();
      let pets = res.data || [];
      // 寄养服务：过滤掉已在寄养中或待接单的宠物
      if (this.data.svc && this.data.svc.category === 'foster') {
        const FOSTER_STATUSES = ['agency_foster', 'pending_foster', 'waiting_pickup'];
        pets = pets.filter(p => !p.petStatus || !FOSTER_STATUSES.includes(p.petStatus));
      }
      this.setData({ myPets: pets });
    } catch (e) {
      console.warn('[ServiceDetail] loadMyPets', e);
    }
  },

  async loadAgencyProfile(agencyProfileId) {
    if (!agencyProfileId) return;
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles').doc(agencyProfileId).get();
      const profile = res.data || {};
      // 解析机构图片
      if (profile.storefrontImage) {
        const urls = await resolveTempUrls([profile.storefrontImage]);
        profile.storefrontImage = urls[0];
      }
      if (profile.envImages && profile.envImages.length) {
        profile.envImages = await resolveTempUrls(profile.envImages.slice(0, 3));
      }
      this.setData({ agencyProfile: profile });
    } catch (e) {
      console.warn('[ServiceDetail] loadAgencyProfile', e);
    }
  },

  async loadAgencyCageInfo(agencyProfileId) {
    if (!agencyProfileId) return;
    const db = wx.cloud.database();
    try {
      const [profileRes, activeRes] = await Promise.all([
        db.collection('agency_profiles').doc(agencyProfileId).get(),
        db.collection('user_orders').where({
          orderType: 'agency',
          category: 'foster',
          agencyProfileId,
          orderStatus: db.command.in(['confirmed', 'in_progress', 'to_confirm']),
        }).get(),
      ]);
      const profile = profileRes.data || {};
      const total = Number(profile.totalCages) || 0;
      const occupied = (activeRes.data || []).length;
      const available = Math.max(0, total - occupied);
      this.setData({
        cageInfo: {
          totalCages: total,
          occupiedCages: occupied,
          availableCages: available,
          cageDesc: profile.cageDesc || '',
        },
      });
    } catch (e) {
      console.warn('[ServiceDetail] loadAgencyCageInfo', e);
    }
  },

  async loadReviews(serviceId) {
    this.setData({ reviewLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('user_orders')
          .where({
            serviceId,
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
      }));

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

  async checkCanReview(serviceId) {
    const userInfo = await authService.checkLogin();
    if (!userInfo) return;
    const db = wx.cloud.database();
    try {
      const res = await withTimeout(
        db.collection('user_orders')
          .where({
            serviceId,
            ownerId: userInfo._id,
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
      this.loadReviews(this.data.svc._id);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submittingReview: false });
    }
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

  onSelectPet(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.myPets.find(p => p._id === id);
    if (!pet) return;
    this.setData({
      selectedPetId: id,
      petName: pet.name || '',
    });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  onPetNameChange(e) { this.setData({ petName: e.detail }); },
  onPhoneChange(e) { this.setData({ phone: e.detail.value }); },
  onRemarkChange(e) { this.setData({ remark: e.detail.value }); },
  onReceiverNameChange(e) { this.setData({ receiverName: e.detail.value }); },
  onReceiverPhoneChange(e) { this.setData({ receiverPhone: e.detail.value }); },
  onReceiverAddressChange(e) { this.setData({ receiverAddress: e.detail.value }); },
  onCheckinDateChange(e) { this.setData({ checkinDate: e.detail.value }); },

  onAgencyTap() {
    const agencyId = this.data.svc.agencyProfileId;
    if (agencyId) {
      wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
    }
  },
  onStayDaysChange(e) {
    const days = parseInt(e.detail.value, 10);
    this.setData({ stayDays: Number.isNaN(days) || days <= 0 ? 1 : days });
  },

  async onSubmitOrder() {
    const { selectedPetId, petName, phone, svc } = this.data;
    const isExtra = svc && svc.category === 'extra';

    if (isExtra) {
      // 商品类：校验收货地址
      if (!this.data.receiverName.trim()) return wx.showToast({ title: '请输入收货人姓名', icon: 'none' });
      if (!this.data.receiverPhone.trim()) return wx.showToast({ title: '请输入收货人电话', icon: 'none' });
      if (!this.data.receiverAddress.trim()) return wx.showToast({ title: '请输入收货地址', icon: 'none' });
    } else {
      // 服务类：校验宠物选择
      if (!selectedPetId) return wx.showToast({ title: '请先选择宠物', icon: 'none' });
    }
    if (!phone.trim()) return wx.showToast({ title: '请输入联系电话', icon: 'none' });

    const userInfo = await authService.checkLogin();
    if (!userInfo) return wx.showToast({ title: '请先登录', icon: 'none' });
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    try {
      const db = wx.cloud.database();
      const s = this.data.svc;
      await this.loadAgencyCageInfo(s.agencyProfileId || '');

      const isFoster = s.category === 'foster';
      if (isFoster) {
        const days = parseInt(this.data.stayDays, 10);
        if (!this.data.checkinDate) {
          return wx.showToast({ title: '请选择寄养开始日期', icon: 'none' });
        }
        if (Number.isNaN(days) || days <= 0) {
          return wx.showToast({ title: '寄养天数必须大于0', icon: 'none' });
        }
        if ((this.data.cageInfo.availableCages || 0) <= 0) {
          return wx.showToast({ title: '机构当前笼位已满，请选择其他机构', icon: 'none' });
        }
      }

      const days = parseInt(this.data.stayDays, 10) || 1;
      const checkinDate = this.data.checkinDate;
      const leaveTimeMs = isFoster
        ? (new Date(checkinDate).getTime() + days * 24 * 60 * 60 * 1000)
        : 0;
      const checkoutDate = isFoster
        ? formatDate(new Date(leaveTimeMs))
        : '';
      const selectedPet = this.data.myPets.find(p => p._id === selectedPetId) || {};

      const payDeadline = new Date(Date.now() + 15 * 60 * 1000);
      const orderType = s.category === 'extra' ? 'express' : 'agency';

      const orderRes = await db.collection('user_orders').add({
        data: {
          ownerId: userInfo._id,
          orderType,
          serviceId: s._id,
          serviceName: s.name,
          category: s.category,
          agencyProfileId: s.agencyProfileId || '',
          agencyName: s.agencyName || '',
          price: s.price,
          unit: s.unit,
          images: this._rawImages || [],
          ...(isExtra ? {
            // 商品类：收货地址
            receiverName: this.data.receiverName.trim(),
            receiverPhone: this.data.receiverPhone.trim(),
            receiverAddress: this.data.receiverAddress.trim(),
          } : {
            // 服务类：宠物信息
            petId: selectedPetId,
            petName: petName.trim(),
            petInfo: {
              species: selectedPet.species || '',
              age: selectedPet.age || '',
              gender: selectedPet.gender || '',
              photo: selectedPet.photo || (s.images && s.images[0]) || '',
            },
          }),
          phone: phone.trim(),
          remark: this.data.remark,
          checkinDate,
          stayDays: days,
          checkoutDate,
          leaveTimeMs,
          orderStatus: 'unpaid',
          payDeadline,
          createTime: db.serverDate(),
        },
      });

      // 寄养宠物状态在付款后再更新，此处不设置
      wx.redirectTo({ url: `/pages/payment/payment?id=${orderRes._id}` });
    } catch (e) {
      console.error('[ServiceDetail] order', e);
      wx.showToast({ title: '下单失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
