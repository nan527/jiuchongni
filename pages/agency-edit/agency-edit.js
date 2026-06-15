// pages/agency-edit/agency-edit.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const BUSINESS_TYPES = ['宠物寄养机构', '宠物医院', '宠物美容洗护', '宠物用品店', '综合服务'];

const AVATAR_LIST = [
  '/static/Avatar/avatar-Andrew.png',
  '/static/Avatar/avatar-Kingdom.png',
  '/static/Avatar/avatar-Mollymolly.png',
  '/static/Avatar/avatar-Paige.png',
  '/static/Avatar/avatar-Sean.png',
];

const APPOINTMENT_OPTIONS = ['电话', '微信', '小程序', '现场'];

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    profileId: '',
    userId: '',
    avatar: '',
    avatarList: AVATAR_LIST,
    currentTab: 1,
    form: {},
    businessTypeOptions: BUSINESS_TYPES,
    businessTypeIndex: 0,
    regionArray: [],
    startTime: '',
    endTime: '',
    appointmentOptions: APPOINTMENT_OPTIONS,
    appointmentMap: {},
    licenseFileList: [],
    permitFileList: [],
    storefrontFileList: [],
    envFileList: [],
    envImages: [],
    saving: false,
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo || !userInfo.agencyProfileId) {
        wx.hideLoading();
        wx.showToast({ title: '未找到机构资料', icon: 'none' });
        return;
      }
      const db = wx.cloud.database();
      const res = await db.collection('agency_profiles').doc(userInfo.agencyProfileId).get();
      const profile = res.data;
      const btIdx = BUSINESS_TYPES.indexOf(profile.businessType);

      // 解析营业时间
      let startTime = '';
      let endTime = '';
      if (profile.businessHours) {
        const parts = profile.businessHours.split('-');
        if (parts.length === 2) {
          startTime = parts[0].trim();
          endTime = parts[1].trim();
        }
      }

      // 解析预约方式
      const appointmentMap = {};
      if (profile.appointmentMethod) {
        APPOINTMENT_OPTIONS.forEach(opt => {
          if (profile.appointmentMethod.includes(opt)) {
            appointmentMap[opt] = true;
          }
        });
      }

      // 解析区域
      let regionArray = [];
      if (profile.region) {
        // 尝试从 region 文本中提取省市区
        regionArray = this._parseRegionText(profile.region);
      }

      this.setData({
        profileId: userInfo.agencyProfileId,
        userId: userInfo._id,
        avatar: userInfo.avatar || '/static/Avatar/avatar-Andrew.png',
        form: {
          orgName: profile.orgName || '',
          creditCode: profile.creditCode || '',
          legalName: profile.legalName || '',
          legalPhone: profile.legalPhone || '',
          region: profile.region || '',
          detailAddress: profile.detailAddress || '',
          businessType: profile.businessType || '',
          serviceScope: profile.serviceScope || '',
          businessHours: profile.businessHours || '',
          appointmentMethod: profile.appointmentMethod || '',
          emergencyContact: profile.emergencyContact || '',
          backupPhone: profile.backupPhone || '',
          orgIntro: profile.orgIntro || '',
          signatureService: profile.signatureService || '',
          totalCages: profile.totalCages ? String(profile.totalCages) : '',
          cageDesc: profile.cageDesc || '',
          licenseImage: profile.licenseImage || '',
          permitImage: profile.permitImage || '',
          storefrontImage: profile.storefrontImage || '',
          envImages: profile.envImages || [],
        },
        businessTypeIndex: btIdx >= 0 ? btIdx : 0,
        regionArray,
        startTime,
        endTime,
        appointmentMap,
        licenseFileList: profile.licenseImage ? [{ url: profile.licenseImage }] : [],
        permitFileList: profile.permitImage ? [{ url: profile.permitImage }] : [],
        storefrontFileList: profile.storefrontImage ? [{ url: profile.storefrontImage }] : [],
        envImages: profile.envImages || [],
        envFileList: (profile.envImages || []).map(url => ({ url })),
      });
    } catch (err) {
      console.error('[AgencyEdit] 加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 解析区域文本为数组
  _parseRegionText(regionText) {
    if (!regionText) return [];
    // 简单解析，返回空数组让 picker 显示 placeholder
    // 实际使用时用户需要重新选择
    return [];
  },

  // ====== 标签切换 ======
  onSwitchTab(e) {
    const tab = Number(e.currentTarget.dataset.tab);
    this.setData({ currentTab: tab });
  },

  // ====== 表单输入 ======
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field) this.setData({ [`form.${field}`]: e.detail.value });
  },

  onBusinessTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      businessTypeIndex: idx,
      'form.businessType': BUSINESS_TYPES[idx],
    });
  },

  // ====== 区域选择 ======
  onRegionChange(e) {
    const regionArray = e.detail.value || [];
    const regionText = regionArray.join('');
    this.setData({
      regionArray,
      'form.region': regionText,
    });
  },

  // ====== 时间选择 ======
  onStartTimeChange(e) {
    const startTime = e.detail.value;
    this.setData({ startTime });
    this._updateBusinessHours();
  },

  onEndTimeChange(e) {
    const endTime = e.detail.value;
    this.setData({ endTime });
    this._updateBusinessHours();
  },

  _updateBusinessHours() {
    const { startTime, endTime } = this.data;
    if (startTime && endTime) {
      this.setData({ 'form.businessHours': `${startTime}-${endTime}` });
    }
  },

  // ====== 预约方式 ======
  onToggleAppointment(e) {
    const value = e.currentTarget.dataset.value;
    const map = { ...this.data.appointmentMap };
    map[value] = !map[value];
    const methods = APPOINTMENT_OPTIONS.filter(opt => map[opt]).join('/');
    this.setData({
      appointmentMap: map,
      'form.appointmentMethod': methods,
    });
  },

  // ====== 头像选择 ======
  onSelectAvatar(e) {
    const avatar = e.currentTarget.dataset.src;
    this.setData({ avatar });
  },

  onChooseCustomAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中…' });
        wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
          filePath: tempPath,
          success: (uploadRes) => {
            this.setData({ avatar: uploadRes.fileID });
            wx.hideLoading();
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
          },
        });
      },
    });
  },

  // ====== 文件上传 ======
  async uploadSingle(filePath, folder) {
    const res = await wx.cloud.uploadFile({
      cloudPath: `${folder}/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`,
      filePath,
    });
    return res.fileID;
  },

  async handleUpload(file, targetField, listField, folder) {
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const fileID = await this.uploadSingle(file.url, folder);
      this.setData({
        [listField]: [{ url: file.url }],
        [`form.${targetField}`]: fileID,
      });
    } catch (err) {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  afterReadLicense(e) {
    this.handleUpload(e.detail.file, 'licenseImage', 'licenseFileList', 'agency/license');
  },
  afterReadPermit(e) {
    this.handleUpload(e.detail.file, 'permitImage', 'permitFileList', 'agency/permit');
  },
  afterReadStorefront(e) {
    this.handleUpload(e.detail.file, 'storefrontImage', 'storefrontFileList', 'agency/storefront');
  },

  async afterReadEnv(e) {
    const file = e.detail.file;
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const fileID = await this.uploadSingle(file.url, 'agency/env');
      const envImages = this.data.envImages.concat(fileID);
      const envFileList = this.data.envFileList.concat({ url: file.url, cloudUrl: fileID });
      this.setData({ envImages, envFileList, 'form.envImages': envImages });
    } catch (err) {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDeleteLicense() {
    this.setData({ licenseFileList: [], 'form.licenseImage': '' });
  },
  onDeletePermit() {
    this.setData({ permitFileList: [], 'form.permitImage': '' });
  },
  onDeleteStorefront() {
    this.setData({ storefrontFileList: [], 'form.storefrontImage': '' });
  },

  onDeleteEnv(e) {
    const idx = e.detail.index;
    const envImages = this.data.envImages.slice();
    const envFileList = this.data.envFileList.slice();
    envImages.splice(idx, 1);
    envFileList.splice(idx, 1);
    this.setData({ envImages, envFileList, 'form.envImages': envImages });
  },

  // ====== 保存 ======
  async save() {
    const f = this.data.form;
    if (!f.orgName) {
      wx.showToast({ title: '请输入机构名称', icon: 'none' });
      this.setData({ currentTab: 1 });
      return;
    }
    if (!f.creditCode) {
      wx.showToast({ title: '请输入统一信用代码', icon: 'none' });
      this.setData({ currentTab: 1 });
      return;
    }
    if (!f.legalName || !f.legalPhone) {
      wx.showToast({ title: '请填写法人信息', icon: 'none' });
      this.setData({ currentTab: 1 });
      return;
    }
    if (!f.region || !f.detailAddress) {
      wx.showToast({ title: '请填写经营地址', icon: 'none' });
      this.setData({ currentTab: 2 });
      return;
    }
    if (!f.totalCages || parseInt(f.totalCages, 10) <= 0) {
      wx.showToast({ title: '请输入有效笼位数', icon: 'none' });
      this.setData({ currentTab: 3 });
      return;
    }
    if (!f.licenseImage) {
      wx.showToast({ title: '请上传营业执照', icon: 'none' });
      this.setData({ currentTab: 4 });
      return;
    }
    if (!f.storefrontImage) {
      wx.showToast({ title: '请上传门头照片', icon: 'none' });
      this.setData({ currentTab: 4 });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      const f = this.data.form;
      await db.collection('agency_profiles').doc(this.data.profileId).update({
        data: {
          orgName: f.orgName,
          creditCode: f.creditCode,
          legalName: f.legalName,
          legalPhone: f.legalPhone,
          region: f.region,
          detailAddress: f.detailAddress,
          businessType: f.businessType,
          serviceScope: f.serviceScope,
          businessHours: f.businessHours,
          appointmentMethod: f.appointmentMethod,
          emergencyContact: f.emergencyContact,
          backupPhone: f.backupPhone,
          orgIntro: f.orgIntro,
          signatureService: f.signatureService,
          totalCages: parseInt(f.totalCages, 10) || 0,
          cageDesc: f.cageDesc || '',
          licenseImage: f.licenseImage,
          permitImage: f.permitImage,
          storefrontImage: f.storefrontImage,
          envImages: f.envImages || [],
          updateTime: db.serverDate(),
        },
      });

      // 同步 nickname 和头像到 users 集合
      const userInfo = await authService.checkLogin();
      if (userInfo && userInfo._id) {
        const updateData = {
          nickname: f.orgName,
          phone: f.legalPhone,
          avatar: this.data.avatar,
        };
        await db.collection('users').doc(userInfo._id).update({
          data: updateData,
        });
        // 更新本地缓存
        const STORAGE_KEYS = require('../../constants/index').STORAGE_KEYS;
        const cachedInfo = wx.getStorageSync(STORAGE_KEYS.USER_INFO);
        if (cachedInfo) {
          cachedInfo.nickname = f.orgName;
          cachedInfo.avatar = this.data.avatar;
          wx.setStorageSync(STORAGE_KEYS.USER_INFO, cachedInfo);
        }
      }

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (err) {
      console.error('[AgencyEdit] 保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
