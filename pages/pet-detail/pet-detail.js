// pages/pet-detail/pet-detail.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

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
    if (id) {
      await this.loadPet(id);
      this.loadHealthRecords(id);
    }
  },

  async loadPet(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('pets').doc(id).get();
      const pet = res.data;
      // 校验所有权：宠物必须属于当前用户
      if (pet.ownerId !== this._userId) {
        wx.showToast({ title: '无权访问该宠物', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({
        pet,
        statusConfig: STATUS_CONFIG[pet.petStatus] || null,
        loading: false,
      });
    } catch (e) {
      this.setData({ pet: null, loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadHealthRecords(petId) {
    // 所有权校验：宠物不属于当前用户则不加载健康记录
    if (this.data.pet && this.data.pet.ownerId !== this._userId) return;
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
    const { pet } = this.data;
    this.setData({
      editing: true,
      name: pet.name || '',
      species: pet.species || '',
      age: pet.age ? String(pet.age) : '',
      character: pet.character || '',
      special: pet.special_needs || '',
      photoUrl: pet.photo || '',
      fileList: pet.photo ? [{ url: pet.photo }] : [],
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onNameChange(e) { this.setData({ name: e.detail.value || e.detail }); },
  onSpeciesChange(e) { this.setData({ species: e.detail.value || e.detail }); },
  onAgeChange(e) { this.setData({ age: e.detail.value || e.detail }); },
  onCharacterChange(e) { this.setData({ character: e.detail.value || e.detail }); },
  onSpecialChange(e) { this.setData({ special: e.detail.value || e.detail }); },

  async afterRead(event) {
    const { file } = event.detail;
    wx.showLoading({ title: '上传中' });
    try {
      const res = await wx.cloud.uploadFile({
        cloudPath: `pets/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
        filePath: file.url,
      });
      this.setData({ photoUrl: res.fileID, fileList: [{ url: file.url }] });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'none' });
    }
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
          character: this.data.character,
          special_needs: this.data.special,
          photo: this.data.photoUrl,
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

  onShareAppMessage() {
    const { pet } = this.data;
    return {
      title: `${pet?.name || '宠物'}的档案`,
      path: `/pages/pet-detail/pet-detail?id=${pet?._id}`,
    };
  },
});
