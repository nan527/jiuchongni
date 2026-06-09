// pages/service-detail/service-detail.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');
const { CAT_TITLE_MAP, formatDate } = require('../../utils/helpers');

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
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad(options) {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
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
  onPhoneChange(e) { this.setData({ phone: e.detail }); },
  onRemarkChange(e) { this.setData({ remark: e.detail }); },
  onCheckinDateChange(e) { this.setData({ checkinDate: e.detail.value }); },

  onAgencyTap() {
    const agencyId = this.data.svc.agencyProfileId;
    if (agencyId) {
      wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
    }
  },
  onStayDaysChange(e) {
    const days = parseInt(e.detail, 10);
    this.setData({ stayDays: Number.isNaN(days) || days <= 0 ? 1 : days });
  },

  async onSubmitOrder() {
    const { selectedPetId, petName, phone } = this.data;
    if (!selectedPetId) return wx.showToast({ title: '请先选择宠物', icon: 'none' });
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

      const orderRes = await db.collection('user_orders').add({
        data: {
          ownerId: userInfo._id,
          orderType: 'agency',
          serviceId: s._id,
          serviceName: s.name,
          category: s.category,
          agencyProfileId: s.agencyProfileId || '',
          agencyName: s.agencyName || '',
          price: s.price,
          unit: s.unit,
          images: this._rawImages || [],
          petId: selectedPetId,
          petName: petName.trim(),
          petInfo: {
            species: selectedPet.species || '',
            age: selectedPet.age || '',
            gender: selectedPet.gender || '',
            photo: selectedPet.photo || (s.images && s.images[0]) || '',
          },
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
