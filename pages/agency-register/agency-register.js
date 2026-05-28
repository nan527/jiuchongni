// pages/agency-register/agency-register.js
const authService = require('../../services/authService');

const BUSINESS_TYPES = ['宠物寄养机构', '宠物医院', '宠物美容洗护', '宠物用品店', '综合服务'];
const DRAFT_KEY = 'agency_register_draft';

Page({
  data: {
    form: {
      orgName: '',
      creditCode: '',
      legalName: '',
      legalPhone: '',
      region: '',
      detailAddress: '',
      businessType: '',
      serviceScope: '',
      businessHours: '',
      appointmentMethod: '',
      account: '',
      password: '',
      emergencyContact: '',
      backupPhone: '',
      orgIntro: '',
      signatureService: '',
      licenseImage: '',
      permitImage: '',
      storefrontImage: '',
    },
    businessTypeOptions: BUSINESS_TYPES,
    businessTypeIndex: 0,
    licenseFileList: [],
    permitFileList: [],
    storefrontFileList: [],
    submitting: false,
    isLoggedIn: false,
  },

  async onLoad() {
    const userInfo = await authService.checkLogin();
    if (userInfo) {
      this.setData({ isLoggedIn: true });
    }
    this._loadDraft();
  },

  setFormField(key, value) {
    this.setData({ [`form.${key}`]: value });
    this._saveDraft();
  },

  onOrgNameChange(e) { this.setFormField('orgName', e.detail); },
  onCreditCodeChange(e) { this.setFormField('creditCode', e.detail); },
  onLegalNameChange(e) { this.setFormField('legalName', e.detail); },
  onLegalPhoneChange(e) { this.setFormField('legalPhone', e.detail); },
  onRegionChange(e) { this.setFormField('region', e.detail); },
  onDetailAddressChange(e) { this.setFormField('detailAddress', e.detail); },
  onServiceScopeChange(e) { this.setFormField('serviceScope', e.detail); },
  onBusinessHoursChange(e) { this.setFormField('businessHours', e.detail); },
  onAppointmentMethodChange(e) { this.setFormField('appointmentMethod', e.detail); },
  onAccountChange(e) { this.setFormField('account', e.detail); },
  onPasswordChange(e) { this.setFormField('password', e.detail); },
  onEmergencyContactChange(e) { this.setFormField('emergencyContact', e.detail); },
  onBackupPhoneChange(e) { this.setFormField('backupPhone', e.detail); },
  onOrgIntroChange(e) { this.setFormField('orgIntro', e.detail); },
  onSignatureServiceChange(e) { this.setFormField('signatureService', e.detail); },

  onBusinessTypeChange(e) {
    const index = Number(e.detail.value);
    this.setData({ businessTypeIndex: index });
    this.setFormField('businessType', BUSINESS_TYPES[index]);
  },

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
      this._saveDraft();
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

  onDeleteLicense() {
    this.setData({ licenseFileList: [] });
    this.setFormField('licenseImage', '');
  },
  onDeletePermit() {
    this.setData({ permitFileList: [] });
    this.setFormField('permitImage', '');
  },
  onDeleteStorefront() {
    this.setData({ storefrontFileList: [] });
    this.setFormField('storefrontImage', '');
  },

  validate() {
    const f = this.data.form;
    if (!f.orgName || !f.creditCode || !f.legalName || !f.legalPhone || !f.region || !f.detailAddress) {
      return '请完整填写基础入驻信息';
    }
    if (!this.data.isLoggedIn) {
      if (!f.account || !f.password) {
        return '请填写机构登录账号和密码';
      }
      if (f.password.length < 6) {
        return '登录密码至少 6 位';
      }
    }
    if (!f.licenseImage || !f.storefrontImage) {
      return '请上传营业执照和门头实景照片';
    }
    return '';
  },

  async submit() {
    const msg = this.validate();
    if (msg) {
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const payload = { ...this.data.form };
      if (this.data.isLoggedIn) {
        payload._skipAccountCheck = true;
      }
      await authService.registerAgency(payload);
      this._clearDraft();
      wx.showModal({
        title: '提交成功',
        content: '机构申请已提交，请等待管理员审核。',
        showCancel: false,
        success: () => {
          if (this.data.isLoggedIn) {
            wx.redirectTo({ url: '/pages/agency/agency' });
          } else {
            wx.navigateBack();
          }
        },
      });
    } catch (err) {
      const code = err.message;
      let content = '提交失败，请稍后重试';
      if (code === 'ACCOUNT_EXISTS') content = '机构登录账号已存在，请更换';
      if (code === 'ORG_NAME_EXISTS') content = '机构名称已存在，请检查';
      if (code === 'CREDIT_CODE_EXISTS') content = '统一社会信用代码已存在';
      if (code === 'MISSING_REQUIRED_FIELDS') content = '请补全必填信息';
      wx.showModal({ title: '提交失败', content, showCancel: false });
    } finally {
      this.setData({ submitting: false });
    }
  },

  _saveDraft() {
    try {
      const draft = {
        form: this.data.form,
        businessTypeIndex: this.data.businessTypeIndex,
      };
      wx.setStorageSync(DRAFT_KEY, draft);
    } catch (e) { /* ignore */ }
  },

  _loadDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY);
      if (draft && draft.form) {
        const form = { ...this.data.form, ...draft.form };
        const update = { form };
        if (draft.businessTypeIndex != null) {
          update.businessTypeIndex = draft.businessTypeIndex;
        }
        // 恢复已上传图片的显示
        if (draft.form.licenseImage) update.licenseFileList = [{ url: draft.form.licenseImage }];
        if (draft.form.permitImage) update.permitFileList = [{ url: draft.form.permitImage }];
        if (draft.form.storefrontImage) update.storefrontFileList = [{ url: draft.form.storefrontImage }];
        this.setData(update);
        wx.showToast({ title: '已恢复草稿', icon: 'none', duration: 1500 });
      }
    } catch (e) { /* ignore */ }
  },

  _clearDraft() {
    try {
      wx.removeStorageSync(DRAFT_KEY);
    } catch (e) { /* ignore */ }
  },
});
