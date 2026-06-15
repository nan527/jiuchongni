// pages/pet-detail/pet-detail.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');
const { resolveTempUrls } = require('../../utils/fileHelper');

const STATUS_CONFIG = {
  agency_foster:   { label: '寄养中',   color: '#FF9800', bg: '#FFF3E0' },
  pending_foster:  { label: '待寄养',   color: '#E65100', bg: '#FFF3E0' },
  waiting_pickup:  { label: '待取回',   color: '#EF6C00', bg: '#FFF8E1' },
  other_foster:    { label: '他人寄养', color: '#1565C0', bg: '#E3F2FD' },
};

const HEALTH_TYPE_LABEL = {
  weight: '体重',
  food: '饮食',
  temperature: '体温',
  vaccine: '疫苗',
  deworming: '驱虫',
  checkup: '体检',
  note: '备注',
};

Page({
  data: {
    pet: null,
    statusConfig: null,
    healthRecords: [],
    healthLoading: true,
    loading: true,
    editing: false,
    // 编辑表单
    name: '',
    species: '',
    age: '',
    character: '',
    special: '',
    fileList: [],
    photoUrl: '',
    saving: false,
    statusBarHeight: 0,
    navBarHeight: 0,
    // AI 个性化寄养方案
    aiPlan: null,
    aiPlanLoading: false,
    aiPlanError: '',
    planExpanded: false,
    // 推荐服务
    recommendServices: [],
    recommendLoading: false,
    // 相册
    photos: [],
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const { id } = options;
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    this._userRole = userInfo.role || 'pet_owner';
    if (id) {
      await this.loadPet(id);
      await this.loadHealthRecords(id);
      this.generateServicePlan();
    }
  },

  async loadPet(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('pets').doc(id).get();
      const pet = res.data;
      // 权限检查：宠主只能看自己的宠物，机构/管理员可以看所有宠物
      const isOwner = pet.ownerId === this._userId;
      const isAgency = this._userRole === 'agency';
      const isAdmin = this._userRole === 'admin';
      if (!isOwner && !isAgency && !isAdmin) {
        wx.showToast({ title: '无权访问该宠物', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const photos = pet.photos || (pet.photo ? [pet.photo] : []);
      const isAgencyViewer = !isOwner && (isAgency || isAdmin);
      this.setData({
        pet,
        photos,
        statusConfig: STATUS_CONFIG[pet.petStatus] || null,
        isAgencyViewer,
        loading: false,
      });
    } catch (e) {
      this.setData({ pet: null, loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadHealthRecords(petId) {
    // 权限校验：非宠主且非机构/管理员则不加载健康记录
    if (this.data.pet) {
      const isOwner = this.data.pet.ownerId === this._userId;
      const isAgency = this._userRole === 'agency';
      const isAdmin = this._userRole === 'admin';
      if (!isOwner && !isAgency && !isAdmin) return;
    }
    this.setData({ healthLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('health_records')
        .where({ pet_id: petId })
        .orderBy('record_date', 'desc')
        .limit(20)
        .get();
      const healthRecords = (res.data || []).map(r => ({
        ...r,
        typeLabel: HEALTH_TYPE_LABEL[r.type] || r.type,
        dateStr: this.formatDate(r.record_date),
      }));
      this.setData({ healthRecords, healthLoading: false });
    } catch (e) {
      this.setData({ healthRecords: [], healthLoading: false });
    }
  },

  formatDate(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
  },

  // 编辑模式
  startEdit() {
    const { pet, photos } = this.data;
    this.setData({
      editing: true,
      name: pet.name || '',
      species: pet.species || '',
      age: pet.age ? String(pet.age) : '',
      gender: pet.gender || '',
      weight: pet.weight ? String(pet.weight) : '',
      neutered: !!pet.neutered,
      character: pet.character || '',
      special: pet.special_needs || '',
      photoUrl: photos[0] || '',
      fileList: photos.map(url => ({ url })),
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onNameChange(e) { this.setData({ name: e.detail.value || e.detail }); },
  onSpeciesChange(e) { this.setData({ species: e.detail.value || e.detail }); },
  onAgeChange(e) { this.setData({ age: e.detail.value || e.detail }); },
  onGenderChange(e) { this.setData({ gender: e.currentTarget.dataset.value }); },
  onWeightChange(e) { this.setData({ weight: e.detail.value || e.detail }); },
  onNeuteredChange(e) { this.setData({ neutered: e.detail }); },
  onCharacterChange(e) { this.setData({ character: e.detail.value || e.detail }); },
  onSpecialChange(e) { this.setData({ special: e.detail.value || e.detail }); },

  async afterRead(event) {
    const files = event.detail.file;
    const fileArray = Array.isArray(files) ? files : [files];
    if (fileArray.length === 0) return;

    wx.showLoading({ title: '上传中' });
    try {
      const uploadPromises = fileArray.map((file, idx) =>
        wx.cloud.uploadFile({
          cloudPath: `pets/${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}.jpg`,
          filePath: file.url,
        })
      );
      const results = await Promise.all(uploadPromises);
      const newFileIDs = results.map(r => r.fileID);
      const allPhotos = [...this.data.photos, ...newFileIDs].slice(0, 5);
      this.setData({
        photos: allPhotos,
        photoUrl: allPhotos[0],
        fileList: allPhotos.map(url => ({ url })),
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'none' });
    }
  },

  onPhotoDelete(event) {
    const { index } = event.detail;
    const newPhotos = this.data.photos.filter((_, i) => i !== index);
    this.setData({
      photos: newPhotos,
      photoUrl: newPhotos[0] || '',
      fileList: newPhotos.map(url => ({ url })),
    });
  },

  previewPhoto(e) {
    const { url } = e.currentTarget.dataset;
    const { photos } = this.data;
    wx.previewImage({
      current: url,
      urls: photos,
    });
  },

  togglePlan() {
    this.setData({ planExpanded: !this.data.planExpanded });
  },

  async saveEdit() {
    if (!this.data.name || !this.data.species) {
      wx.showToast({ title: '请填写昵称和品种', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    // 所有权校验
    if (this.data.pet.ownerId !== this._userId) {
      wx.showToast({ title: '无权修改该宠物', icon: 'none' });
      return;
    }
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      await db.collection('pets').doc(this.data.pet._id).update({
        data: {
          name: this.data.name,
          species: this.data.species,
          age: this.data.age ? parseInt(this.data.age) : 0,
          gender: this.data.gender,
          weight: this.data.weight ? parseFloat(this.data.weight) : 0,
          neutered: this.data.neutered,
          character: this.data.character,
          special_needs: this.data.special,
          photos: this.data.photos,
          photo: this.data.photos[0] || '',
        },
      });
      wx.showToast({ title: '保存成功' });
      this.setData({ editing: false, saving: false });
      this.loadPet(this.data.pet._id);
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  deletePet() {
    const { pet } = this.data;
    // 所有权校验
    if (pet.ownerId !== this._userId) {
      wx.showToast({ title: '无权删除该宠物', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${pet.name}」的档案吗？此操作不可撤销。`,
      confirmColor: '#FF5252',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          await db.collection('pets').doc(pet._id).remove();
          wx.showToast({ title: '已删除' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  // AI 个性化寄养方案
  async generateServicePlan() {
    const { pet, healthRecords } = this.data;
    if (!pet) return;
    this.setData({ aiPlanLoading: true, aiPlanError: '' });
    try {
      const aiRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'pet_service_customize',
          pet_info: {
            name: pet.name,
            species: pet.species,
            age: pet.age,
            character: pet.character,
            special_needs: pet.special_needs,
          },
          health_records: (healthRecords || []).map(r => ({
            type: r.type,
            value: r.value || r.vaccine_name || r.medicine_name || r.result || '',
            food_intake: r.food_intake || '',
            createTime: r.record_date || r.createTime || '',
          })),
        },
      });
      const { success, plan, msg } = aiRes.result || {};
      if (success && plan) {
        this.setData({ aiPlan: plan, aiPlanLoading: false });
        this.loadRecommendServices();
      } else {
        this.setData({ aiPlanLoading: false, aiPlanError: msg || '生成失败' });
      }
    } catch (e) {
      console.warn('[PetDetail] generateServicePlan', e);
      this.setData({ aiPlanLoading: false, aiPlanError: '生成失败，请重试' });
    }
  },

  // 加载推荐寄养服务
  async loadRecommendServices() {
    this.setData({ recommendLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .where({ category: 'foster' })
        .orderBy('createTime', 'desc')
        .limit(3)
        .get();
      let services = res.data || [];

      // 加载机构名称
      const profileIds = [...new Set(services.map(s => s.agencyProfileId).filter(Boolean))];
      const agencyMap = {};
      if (profileIds.length > 0) {
        try {
          const agencyRes = await db.collection('agency_profiles')
            .where({ _id: db.command.in(profileIds) })
            .field({ _id: true, orgName: true })
            .get();
          (agencyRes.data || []).forEach(a => { agencyMap[a._id] = a.orgName; });
        } catch (e) { /* ignore */ }
      }

      // 解析图片
      const allFileIDs = [];
      services.forEach(s => { if (s.images && s.images.length) allFileIDs.push(s.images[0]); });
      const resolvedUrls = allFileIDs.length > 0 ? await resolveTempUrls(allFileIDs) : [];
      const urlMap = {};
      allFileIDs.forEach((id, i) => { urlMap[id] = resolvedUrls[i]; });

      services = services.map(s => ({
        ...s,
        coverImage: s.images && s.images.length ? (urlMap[s.images[0]] || s.images[0]) : '',
        agencyName: agencyMap[s.agencyProfileId] || '',
      }));

      this.setData({ recommendServices: services, recommendLoading: false });
    } catch (e) {
      console.warn('[PetDetail] loadRecommendServices', e);
      this.setData({ recommendServices: [], recommendLoading: false });
    }
  },

  onServiceTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  onShareAppMessage() {
    const { pet } = this.data;
    return {
      title: `${pet?.name || '宠物'}的档案`,
      path: `/pages/pet-detail/pet-detail?id=${pet?._id}`,
    };
  },
});
