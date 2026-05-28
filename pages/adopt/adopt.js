// pages/adopt/adopt.js
const authService = require('../../services/authService');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

Page({
  data: {
    myPets: [],
    petsLoading: true,
    selectedPetId: '',
    fileList: [],
    imageUrls: [],
    petName: '',
    breed: '',
    age: '',
    gender: 'unknown',
    character: '',
    neutered: 'no',
    vaccinated: 'no',
    health: '',
    reason: '',
    requirement: '',
    contactName: '',
    contactPhone: '',
    location: '',
    publishing: false,
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    this.loadMyPets();
  },

  async loadMyPets() {
    const userId = this._userId;
    if (!userId) {
      this.setData({ myPets: [], petsLoading: false });
      wx.showToast({ title: '请重新登录', icon: 'none' });
      return;
    }
    this.setData({ petsLoading: true });
    for (let retry = 0; retry < 2; retry++) {
      try {
        const db = wx.cloud.database();
        const res = await withTimeout(
          db.collection('pets').where({ ownerId: userId }).orderBy('createTime', 'desc').get(),
          8000
        );
        const myPets = (res.data || []).filter(p => p.ownerId === userId);
        this.setData({ myPets, petsLoading: false });
        return;
      } catch (e) {
        console.warn(`[Adopt] loadMyPets 第${retry + 1}次失败:`, e);
        if (retry === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }
    this.setData({ myPets: [], petsLoading: false });
    wx.showToast({ title: '加载宠物列表失败，请重试', icon: 'none' });
  },

  onSelectPet(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.myPets.find(p => p._id === id);
    if (!pet) return;
    this.setData({
      selectedPetId: id,
      petName: pet.name || '',
      breed: pet.species || '',
      age: pet.age ? String(pet.age) : '',
      gender: pet.gender || 'unknown',
      character: pet.character || '',
    });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  // ===== 表单事件 =====
  onNeuteredChange(e) { this.setData({ neutered: e.detail }); },
  onVaccinatedChange(e) { this.setData({ vaccinated: e.detail }); },
  onHealthChange(e) { this.setData({ health: e.detail }); },
  onReasonChange(e) { this.setData({ reason: e.detail }); },
  onRequirementChange(e) { this.setData({ requirement: e.detail }); },
  onContactNameChange(e) { this.setData({ contactName: e.detail }); },
  onContactPhoneChange(e) { this.setData({ contactPhone: e.detail }); },
  onLocationChange(e) { this.setData({ location: e.detail }); },

  /** 上传图片 */
  afterRead(event) {
    const { file } = event.detail;
    const files = Array.isArray(file) ? file : [file];
    const startIndex = this.data.fileList.length;
    const newFileList = [...this.data.fileList, ...files.map(f => ({ url: f.url, status: 'uploading', message: '上传中' }))];
    const newImageUrls = [...this.data.imageUrls, ...files.map(() => '')];
    this.setData({ fileList: newFileList, imageUrls: newImageUrls });

    files.forEach((f, i) => {
      const fileIndex = startIndex + i;
      wx.cloud.uploadFile({
        cloudPath: `adopt/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`,
        filePath: f.url,
        success: (res) => {
          const updatedList = [...this.data.fileList];
          updatedList[fileIndex] = { ...updatedList[fileIndex], status: 'done', message: '' };
          const updatedUrls = [...this.data.imageUrls];
          updatedUrls[fileIndex] = res.fileID;
          this.setData({ fileList: updatedList, imageUrls: updatedUrls });
        },
        fail: () => {
          const updatedList = [...this.data.fileList];
          updatedList[fileIndex] = { ...updatedList[fileIndex], status: 'failed', message: '失败' };
          this.setData({ fileList: updatedList });
        },
      });
    });
  },

  deleteImage(event) {
    const { index } = event.detail;
    const fileList = [...this.data.fileList];
    const imageUrls = [...this.data.imageUrls];
    fileList.splice(index, 1);
    imageUrls.splice(index, 1);
    this.setData({ fileList, imageUrls });
  },

  /** 发布 */
  async publish() {
    const { selectedPetId, reason, contactName, contactPhone } = this.data;
    if (!selectedPetId) return wx.showToast({ title: '请先选择宠物', icon: 'none' });
    if (!reason.trim()) return wx.showToast({ title: '请填写送养原因', icon: 'none' });
    if (!contactName.trim()) return wx.showToast({ title: '请输入联系人', icon: 'none' });
    if (!contactPhone.trim()) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (this.data.publishing) return;
    this.setData({ publishing: true });

    try {
      const db = wx.cloud.database();
      const userInfo = await authService.checkLogin();
      const pet = this.data.myPets.find(p => p._id === selectedPetId);
      const uploadedUrls = this.data.imageUrls.filter(u => u);
      const images = uploadedUrls.length > 0 ? uploadedUrls : (pet && pet.photo ? [pet.photo] : []);

      await db.collection('adoptions').add({
        data: {
          type: 'adopt',
          ownerId: this._userId,
          petId: selectedPetId,
          petName: this.data.petName.trim(),
          breed: this.data.breed.trim(),
          age: this.data.age,
          gender: this.data.gender,
          neutered: this.data.neutered,
          vaccinated: this.data.vaccinated,
          health: this.data.health,
          character: this.data.character,
          reason: reason.trim(),
          requirement: this.data.requirement,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          location: this.data.location,
          images: images,
          authorName: userInfo ? userInfo.nickname : '匿名',
          authorAvatar: userInfo ? userInfo.avatar : '',
          status: 'open',
          createTime: db.serverDate(),
        },
      });

      // 更新宠物档案状态
      try {
        await db.collection('pets').doc(selectedPetId).update({
          data: { petStatus: 'pending_adopt' },
        });
      } catch (e) { console.warn('[Adopt] 更新宠物状态失败', e); }

      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      console.error('[Adopt] 发布失败', err);
      if (err.errCode === -502005) {
        wx.showModal({
          title: '集合不存在',
          content: '请先在云开发控制台创建 adoptions 集合',
          showCancel: false,
        });
      } else {
        wx.showToast({ title: '发布失败', icon: 'none' });
      }
    } finally {
      this.setData({ publishing: false });
    }
  },
});
