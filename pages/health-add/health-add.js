// pages/health-add/health-add.js
const authService = require('../../services/authService');
const db = wx.cloud.database();

const TYPE_LIST = [
  { key: 'weight', label: '体重' },
  { key: 'vaccine', label: '疫苗' },
  { key: 'deworming', label: '驱虫' },
  { key: 'checkup', label: '体检' },
  { key: 'food', label: '饮食' },
  { key: 'note', label: '备注' },
];

Page({
  data: {
    typeList: TYPE_LIST,
    activeType: 'weight',
    petId: '',
    selectedPet: null,
    // 通用
    recordDate: '',
    note: '',
    fileList: [],
    imageUrls: [],
    saving: false,
    // 体重
    weight: '',
    // 疫苗
    vaccineName: '',
    institution: '',
    nextDate: '',
    // 驱虫
    medicineName: '',
    // 体检
    checkupResult: '',
    // 饮食
    foodIntake: '',
    // 备注
    noteContent: '',
  },

  async onLoad(options) {
    const { petId, type } = options;

    // 登录校验
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;

    // 设置默认日期为今天
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    this.setData({
      petId: petId || '',
      recordDate: today,
      activeType: type && TYPE_LIST.find(t => t.key === type) ? type : 'weight',
    });

    if (petId) {
      this.loadPet(petId);
    }
  },

  async loadPet(petId) {
    try {
      const res = await db.collection('pets').doc(petId).get();
      // 所有权校验
      if (res.data.ownerId !== this._userId) {
        wx.showToast({ title: '无权为该宠物添加记录', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({ selectedPet: res.data });
    } catch (e) {
      console.warn('[HealthAdd] loadPet', e);
    }
  },

  onTypeChange(e) {
    this.setData({ activeType: e.currentTarget.dataset.key });
  },

  onDateChange(e) {
    this.setData({ recordDate: e.detail.value });
  },

  onNextDateChange(e) {
    this.setData({ nextDate: e.detail.value });
  },

  onWeightChange(e) {
    this.setData({ weight: e.detail.value });
  },

  onVaccineNameChange(e) {
    this.setData({ vaccineName: e.detail.value });
  },

  onInstitutionChange(e) {
    this.setData({ institution: e.detail.value });
  },

  onMedicineNameChange(e) {
    this.setData({ medicineName: e.detail.value });
  },

  onCheckupResultChange(e) {
    this.setData({ checkupResult: e.detail.value });
  },

  onFoodIntakeChange(e) {
    this.setData({ foodIntake: e.detail.value });
  },

  onNoteContentChange(e) {
    this.setData({ noteContent: e.detail.value });
  },

  onNoteChange(e) {
    this.setData({ note: e.detail.value });
  },

  // 图片上传
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
        cloudPath: `health/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`,
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

  async saveRecord() {
    const { activeType, petId, recordDate } = this.data;

    if (!petId) return wx.showToast({ title: '请先选择宠物', icon: 'none' });
    if (!recordDate) return wx.showToast({ title: '请选择日期', icon: 'none' });

    // 验证必填字段
    if (activeType === 'weight' && !this.data.weight) {
      return wx.showToast({ title: '请输入体重', icon: 'none' });
    }
    if (activeType === 'vaccine' && !this.data.vaccineName) {
      return wx.showToast({ title: '请输入疫苗名称', icon: 'none' });
    }
    if (activeType === 'deworming' && !this.data.medicineName) {
      return wx.showToast({ title: '请输入驱虫药名称', icon: 'none' });
    }
    if (activeType === 'food' && !this.data.foodIntake) {
      return wx.showToast({ title: '请输入饮食情况', icon: 'none' });
    }
    if (activeType === 'note' && !this.data.noteContent) {
      return wx.showToast({ title: '请输入备注内容', icon: 'none' });
    }

    if (this.data.saving) return;
    // 所有权校验（防御性检查）
    if (this.data.selectedPet && this.data.selectedPet.ownerId !== this._userId) {
      wx.showToast({ title: '无权为该宠物添加记录', icon: 'none' });
      return;
    }
    this.setData({ saving: true });

    try {
      const recordData = {
        ownerId: this._userId,
        pet_id: petId,
        type: activeType,
        record_date: new Date(recordDate),
        note: this.data.note,
        images: this.data.imageUrls.filter(u => u),
        recorder_role: 'owner',
      };

      // 根据类型填充字段
      switch (activeType) {
        case 'weight':
          recordData.value = this.data.weight;
          break;
        case 'vaccine':
          recordData.value = this.data.vaccineName;
          recordData.vaccine_name = this.data.vaccineName;
          recordData.institution = this.data.institution;
          if (this.data.nextDate) recordData.next_date = new Date(this.data.nextDate);
          break;
        case 'deworming':
          recordData.value = this.data.medicineName;
          recordData.medicine_name = this.data.medicineName;
          if (this.data.nextDate) recordData.next_date = new Date(this.data.nextDate);
          break;
        case 'checkup':
          recordData.value = this.data.checkupResult;
          recordData.result = this.data.checkupResult;
          recordData.institution = this.data.institution;
          break;
        case 'food':
          recordData.value = this.data.foodIntake;
          recordData.food_intake = this.data.foodIntake;
          break;
        case 'note':
          recordData.value = this.data.noteContent;
          break;
      }

      await db.collection('health_records').add({ data: recordData });

      wx.showToast({ title: '记录成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      console.error('[HealthAdd] saveRecord', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
