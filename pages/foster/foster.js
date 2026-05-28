// pages/foster/foster.js
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
    specialNeeds: '',
    today: '',
    startDate: '',
    endDate: '',
    days: 0,
    budget: '',
    description: '',
    contactName: '',
    contactPhone: '',
    location: '',
    publishing: false,
  },

  async onShow() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    this.setData({ today: `${y}-${m}-${d}` });

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
        console.warn(`[Foster] loadMyPets 第${retry + 1}次失败:`, e);
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
      specialNeeds: pet.special_needs || '',
    });
  },

  toPetArchive() {
    wx.navigateTo({ url: '/packagePet/pages/pet/pet' });
  },

  // ===== 表单事件 =====
  onSpecialNeedsChange(e) { this.setData({ specialNeeds: e.detail }); },
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this._calcDays();
  },
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this._calcDays();
  },
  _calcDays() {
    const { startDate, endDate } = this.data;
    if (startDate && endDate) {
      const diff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
      this.setData({ days: diff > 0 ? diff : 0 });
    }
  },
  onBudgetChange(e) { this.setData({ budget: e.detail }); },
  onDescriptionChange(e) { this.setData({ description: e.detail }); },
  onContactNameChange(e) { this.setData({ contactName: e.detail }); },
  onContactPhoneChange(e) { this.setData({ contactPhone: e.detail }); },
  onLocationChange(e) { this.setData({ location: e.detail }); },

  /** 上传图片 */
  afterRead(event) {
    const { file } = event.detail;
    const files = Array.isArray(file) ? file : [file];
    const startIndex = this.data.fileList.length;
    const newFileList = [...this.data.fileList, ...files.map(f => ({ url: f.url, status: 'uploading', message: '上传中' }))];
    // 预留 imageUrls 位置，避免并发覆盖
    const newImageUrls = [...this.data.imageUrls, ...files.map(() => '')];
    this.setData({ fileList: newFileList, imageUrls: newImageUrls });

    files.forEach((f, i) => {
      const fileIndex = startIndex + i;
      wx.cloud.uploadFile({
        cloudPath: `foster/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`,
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
    const { selectedPetId, petName, breed, startDate, endDate, description, contactName, contactPhone } = this.data;
    if (!selectedPetId) return wx.showToast({ title: '请先选择宠物', icon: 'none' });
    if (!startDate) return wx.showToast({ title: '请填写寄养开始日期', icon: 'none' });
    if (!endDate) return wx.showToast({ title: '请填写寄养结束日期', icon: 'none' });
    if (!description.trim()) return wx.showToast({ title: '请填写寄养说明', icon: 'none' });
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

      await db.collection('fosters').add({
        data: {
          type: 'foster',
          ownerId: this._userId,
          petId: selectedPetId,
          petName: petName.trim(),
          breed: breed.trim(),
          age: this.data.age,
          gender: this.data.gender,
          character: this.data.character,
          specialNeeds: this.data.specialNeeds,
          startDate: startDate,
          endDate: endDate,
          days: this.data.days ? parseInt(this.data.days) : 0,
          budget: this.data.budget,
          description: description.trim(),
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
          data: { petStatus: 'pending_foster' },
        });
      } catch (e) { console.warn('[Foster] 更新宠物状态失败', e); }

      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      console.error('[Foster] 发布失败', err);
      if (err.errCode === -502005) {
        wx.showModal({
          title: '集合不存在',
          content: '请先在云开发控制台创建 fosters 集合',
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
