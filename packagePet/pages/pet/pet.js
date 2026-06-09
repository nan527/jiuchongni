// pages/pet/pet.js
const authService = require('../../../services/authService');
const { getStatusBarHeight } = require('../../../utils/helpers');

const PRESET_AVATARS = [
  { name: '金毛', src: '/packagePet/static/Avatar/pet/金毛.png' },
  { name: '拉布拉多', src: '/packagePet/static/Avatar/pet/拉布拉多.png' },
  { name: '柯基', src: '/packagePet/static/Avatar/pet/柯基.png' },
  { name: '哈士奇', src: '/packagePet/static/Avatar/pet/哈士奇.png' },
  { name: '柴犬', src: '/packagePet/static/Avatar/pet/柴犬.png' },
  { name: '泰迪贵宾', src: '/packagePet/static/Avatar/pet/泰迪贵宾.png' },
  { name: '萨摩耶', src: '/packagePet/static/Avatar/pet/萨摩耶.png' },
  { name: '博美', src: '/packagePet/static/Avatar/pet/博美.png' },
  { name: '比熊', src: '/packagePet/static/Avatar/pet/比熊.png' },
  { name: '边牧', src: '/packagePet/static/Avatar/pet/边牧.png' },
  { name: '法斗', src: '/packagePet/static/Avatar/pet/法斗.png' },
  { name: '吉娃娃', src: '/packagePet/static/Avatar/pet/吉娃娃.png' },
  { name: '雪纳瑞', src: '/packagePet/static/Avatar/pet/雪纳瑞.png' },
  { name: '中华田园犬', src: '/packagePet/static/Avatar/pet/中华田园犬.png' },
  { name: '布偶猫', src: '/packagePet/static/Avatar/pet/布偶猫.png' },
  { name: '英国短毛猫', src: '/packagePet/static/Avatar/pet/英国短毛猫.png' },
  { name: '美国短毛猫', src: '/packagePet/static/Avatar/pet/美国短毛猫.png' },
  { name: '加菲猫', src: '/packagePet/static/Avatar/pet/加菲猫.png' },
  { name: '暹罗猫', src: '/packagePet/static/Avatar/pet/暹罗猫.png' },
  { name: '波斯猫', src: '/packagePet/static/Avatar/pet/波斯猫.png' },
  { name: '金渐层', src: '/packagePet/static/Avatar/pet/金渐层.png' },
  { name: '银渐层', src: '/packagePet/static/Avatar/pet/银渐层.png' },
  { name: '曼基康矮脚猫', src: '/packagePet/static/Avatar/pet/曼基康矮脚猫.png' },
  { name: '斯芬克斯无毛猫', src: '/packagePet/static/Avatar/pet/斯芬克斯无毛猫.png' },
  { name: '中华田园猫', src: '/packagePet/static/Avatar/pet/中华田园猫.png' },
];

const STATUS_CONFIG = {
  agency_foster:   { label: '寄养中',   color: '#FF9800', bg: '#FFF3E0' },
  pending_adopt:   { label: '待领养',   color: '#2E7D32', bg: '#E8F5E9' },
  pending_foster:  { label: '待寄养',   color: '#E65100', bg: '#FFF3E0' },
  waiting_pickup:  { label: '待取回',   color: '#EF6C00', bg: '#FFF8E1' },
  other_foster:    { label: '他人寄养', color: '#1565C0', bg: '#E3F2FD' },
  adopted_in:      { label: '领养入',   color: '#2E7D32', bg: '#E8F5E9' },
  adopted_out:     { label: '已送养',   color: '#C2185B', bg: '#FCE4EC' },
};

Page({
  data: {
    petList: [],
    loading: true,
    displayPetId: '',
    showForm: false,
    name: '',
    species: '',
    age: '',
    character: '',
    special: '',
    fileList: [],
    photoUrl: '',
    saving: false,
    editingId: '',
    showAvatarPicker: false,
    presetAvatars: PRESET_AVATARS,
    selectedPresetIdx: -1,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onGoBack() {
    wx.navigateBack();
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    this.setData({ displayPetId: userInfo.displayPetId || '' });
    this.loadPetList();
  },

  async loadPetList() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ petList: [], loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('pets')
        .where({ ownerId: userId })
        .orderBy('createTime', 'desc')
        .get();
      const petList = (res.data || []).filter(p => p.ownerId === userId).map(p => ({
        ...p,
        statusConfig: STATUS_CONFIG[p.petStatus] || null,
      }));

      // 加载已通过的领养申请
      try {
        const applyRes = await db.collection('foster_applications')
          .where({ ownerId: userId, applyType: 'adopt', applyStatus: 'approved' })
          .get();
        const adoptedPets = (applyRes.data || []).filter(a => a.ownerId === userId).map(a => ({
          _id: 'adopted_' + a._id,
          name: a.petName,
          species: a.breed || '',
          photo: (a.images && a.images[0]) || '',
          petStatus: 'adopted_in',
          statusConfig: STATUS_CONFIG.adopted_in,
          character: '',
          age: '',
          _isAdopted: true,
        }));
        const existNames = new Set(petList.map(p => p.name));
        adoptedPets.forEach(ap => {
          if (!existNames.has(ap.name)) petList.push(ap);
        });
      } catch (e) { /* collection may not exist */ }

      // 校验寄养状态：如果宠物标记为寄养中但没有对应的活跃订单，重置状态
      const FOSTER_STATUSES = ['agency_foster', 'pending_foster', 'waiting_pickup'];
      const fosterPets = petList.filter(p => p.petStatus && FOSTER_STATUSES.includes(p.petStatus) && !p._isAdopted);
      if (fosterPets.length > 0) {
        try {
          const _ = db.command;
          const activeRes = await db.collection('user_orders')
            .where({
              ownerId: userId,
              category: 'foster',
              petId: _.in(fosterPets.map(p => p._id)),
              orderStatus: _.in(['unpaid', 'pending', 'confirmed', 'in_progress', 'to_confirm']),
            })
            .get();
          const activePetIds = new Set((activeRes.data || []).map(o => o.petId));
          for (const pet of fosterPets) {
            if (!activePetIds.has(pet._id)) {
              pet.petStatus = '';
              pet.statusConfig = null;
              try {
                await db.collection('pets').doc(pet._id).update({
                  data: { petStatus: '', updateTime: db.serverDate() },
                });
              } catch (e) { /* ignore */ }
            }
          }
        } catch (e) { /* ignore */ }
      }

      this.setData({ petList, loading: false });
    } catch (err) {
      console.error('[Pet] 加载宠物列表失败', err);
      this.setData({ loading: false });
    }
  },

  // 点击卡片 → 进入详情
  onPetTap(e) {
    const id = e.currentTarget.dataset.id;
    if (id.startsWith('adopted_')) {
      wx.showToast({ title: '领养宠物详情开发中', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/pet-detail/pet-detail?id=${id}` });
  },

  // 点击编辑图标 → 直接打开编辑表单
  onEditPet(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.petList.find(p => p._id === id);
    if (!pet || pet._isAdopted) {
      wx.showToast({ title: '领养宠物暂不支持编辑', icon: 'none' });
      return;
    }
    this.setData({
      showForm: true,
      editingId: pet._id,
      name: pet.name || '',
      species: pet.species || '',
      age: pet.age ? String(pet.age) : '',
      character: pet.character || '',
      special: pet.special_needs || '',
      photoUrl: pet.photo || '',
      fileList: pet.photo ? [{ url: pet.photo }] : [],
      selectedPresetIdx: -1,
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  // 设为展示宠物
  async setAsDisplayPet(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.displayPetId) return;
    try {
      const db = wx.cloud.database();
      const STORAGE_KEYS = require('../../../constants/index').STORAGE_KEYS;
      await db.collection('users').doc(this._userId).update({
        data: { displayPetId: id },
      });
      // 同步更新本地缓存
      const userInfo = wx.getStorageSync(STORAGE_KEYS.USER_INFO) || {};
      userInfo.displayPetId = id;
      wx.setStorageSync(STORAGE_KEYS.USER_INFO, userInfo);
      this.setData({ displayPetId: id });
      wx.showToast({ title: '已设为展示宠物', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '设置失败', icon: 'none' });
    }
  },

  // 添加表单
  toggleForm() {
    const show = !this.data.showForm;
    this.setData({
      showForm: show,
      ...(show ? { editingId: '', name: '', species: '', age: '', character: '', special: '', fileList: [], photoUrl: '', selectedPresetIdx: -1 } : {}),
    });
  },

  openAvatarPicker() { this.setData({ showAvatarPicker: true }); },
  closeAvatarPicker() { this.setData({ showAvatarPicker: false }); },

  onPickAvatar(e) {
    const idx = e.currentTarget.dataset.idx;
    const avatar = PRESET_AVATARS[idx];
    if (!avatar) return;
    this.setData({
      selectedPresetIdx: idx,
      photoUrl: avatar.src,
      fileList: [{ url: avatar.src }],
      showAvatarPicker: false,
    });
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

  async savePet() {
    if (!this.data.name || !this.data.species) {
      wx.showToast({ title: '请填写昵称和品种', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      const petData = {
        name: this.data.name,
        species: this.data.species,
        age: this.data.age ? parseInt(this.data.age) : 0,
        character: this.data.character,
        special_needs: this.data.special,
        photo: this.data.photoUrl,
      };

      if (this.data.editingId) {
        await db.collection('pets').doc(this.data.editingId).update({ data: petData });
        wx.showToast({ title: '修改成功' });
      } else {
        petData.createTime = db.serverDate();
        petData.ownerId = this._userId;
        await db.collection('pets').add({ data: petData });
        wx.showToast({ title: '添加成功' });
      }

      this.setData({ showForm: false, saving: false, editingId: '' });
      this.loadPetList();
    } catch (err) {
      this.setData({ saving: false });
      wx.showModal({ title: '保存失败', content: '请检查数据库权限', showCancel: false });
    }
  },

  onDeletePet(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${name}」的档案吗？此操作不可撤销。`,
      confirmColor: '#E53935',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          await db.collection('pets').doc(id).remove();
          wx.showToast({ title: '已删除' });
          this.loadPetList();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
