// pages/profile/profile.js
const authService = require('../../services/authService');

const AVATAR_LIST = [
  '/static/Avatar/avatar-Andrew.png',
  '/static/Avatar/avatar-Kingdom.png',
  '/static/Avatar/avatar-Mollymolly.png',
  '/static/Avatar/avatar-Paige.png',
  '/static/Avatar/avatar-Sean.png',
];

Page({
  data: {
    avatarList: AVATAR_LIST,
    avatar: '',
    nickname: '',
    email: '',
    phone: '',
    address: '',
    bio: '',
    saving: false,
    _id: '',
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.navigateBack();
      return;
    }
    this.setData({
      _id: userInfo._id || '',
      avatar: userInfo.avatar || '/static/missing-face.png',
      nickname: userInfo.nickname || '',
      email: userInfo.email || '',
      phone: userInfo.phone || '',
      address: userInfo.address || '',
      bio: userInfo.bio || '',
    });
  },

  /** 选择预设头像 */
  onSelectAvatar(e) {
    const avatar = e.currentTarget.dataset.src;
    this.setData({ avatar });
  },

  /** 从相册自定义头像 */
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

  onNicknameChange(e) { this.setData({ nickname: e.detail.value }); },
  onEmailChange(e) { this.setData({ email: e.detail.value }); },
  onPhoneChange(e) { this.setData({ phone: e.detail.value }); },
  onAddressChange(e) { this.setData({ address: e.detail.value }); },
  onBioChange(e) { this.setData({ bio: e.detail.value }); },

  /** 保存资料 */
  async saveProfile() {
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      const updateData = {
        avatar: this.data.avatar,
        nickname: this.data.nickname.trim(),
        email: this.data.email.trim(),
        phone: this.data.phone.trim(),
        address: this.data.address.trim(),
        bio: this.data.bio.trim(),
      };

      if (this.data._id) {
        await db.collection('users').doc(this.data._id).update({
          data: updateData,
        });
      }

      // 同步更新本地缓存
      const cached = authService._getCachedUser() || {};
      const newInfo = Object.assign({}, cached, updateData, { _id: this.data._id });
      authService._cacheUser(newInfo);

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      console.error('[Profile] 保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
