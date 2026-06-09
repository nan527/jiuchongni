// pages/admin/audit-detail.js
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    loading: true,
    profile: {},
    userInfo: {},
    statusBarHeight: 0,
    navBarHeight: 0,
    images: [],
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const { userId, profileId } = options;
    if (userId) {
      this.loadDetail(userId, profileId);
    }
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadDetail(userId, profileId) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      let userInfo = {};
      let profile = {};

      if (userId) {
        const userRes = await db.collection('users').doc(userId).get();
        userInfo = userRes.data || {};
      }
      if (profileId) {
        const profileRes = await db.collection('agency_profiles').doc(profileId).get();
        profile = profileRes.data || {};
      }

      // 解析图片
      const fileIDs = [];
      ['licenseImage', 'storefrontImage', 'permitImage'].forEach((key) => {
        if (profile[key] && profile[key].startsWith('cloud://')) fileIDs.push(profile[key]);
      });
      if (Array.isArray(profile.envImages)) {
        profile.envImages.forEach((img) => {
          if (img && img.startsWith('cloud://')) fileIDs.push(img);
        });
      }

      let images = [];
      if (fileIDs.length) {
        try {
          const urlRes = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'get_file_urls', fileIDs },
          });
          const urls = (urlRes.result && urlRes.result.urls) || [];
          const urlMap = {};
          fileIDs.forEach((id, i) => { urlMap[id] = urls[i] || id; });
          // 替换 profile 中的图片 URL
          if (profile.licenseImage && urlMap[profile.licenseImage]) profile.licenseImage = urlMap[profile.licenseImage];
          if (profile.storefrontImage && urlMap[profile.storefrontImage]) profile.storefrontImage = urlMap[profile.storefrontImage];
          if (profile.permitImage && urlMap[profile.permitImage]) profile.permitImage = urlMap[profile.permitImage];
          if (Array.isArray(profile.envImages)) {
            profile.envImages = profile.envImages.map((img) => urlMap[img] || img);
          }
          // 收集所有图片用于预览
          images = urls.filter(Boolean);
        } catch (e) { /* ignore */ }
      }

      this.setData({ profile, userInfo, images, loading: false });
    } catch (err) {
      console.error('[AuditDetail] load', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      current: src,
      urls: this.data.images.length ? this.data.images : [src],
    });
  },

  async approve() {
    const { profile, userInfo } = this.data;
    wx.showModal({
      title: '确认通过',
      content: `确定通过「${profile.orgName || '该机构'}」的入驻申请？`,
      confirmColor: '#FF9800',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'update_agency_audit', userId: userInfo._id, profileId: profile._id, status: 'approved' },
          });
          if (result.result && result.result.success) {
            wx.showToast({ title: '已通过', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
          } else {
            wx.showToast({ title: '操作失败: ' + (result.result.msg || '未知错误'), icon: 'none' });
          }
        } catch (err) {
          console.error('[AuditDetail] approve error', err);
          wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
        }
      },
    });
  },

  async reject() {
    const { profile, userInfo } = this.data;
    wx.showModal({
      title: '确认驳回',
      content: `确定驳回「${profile.orgName || '该机构'}」的入驻申请？`,
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await wx.cloud.callFunction({
            name: 'ai_handler',
            data: { action: 'update_agency_audit', userId: userInfo._id, profileId: profile._id, status: 'rejected' },
          });
          if (result.result && result.result.success) {
            wx.showToast({ title: '已驳回', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
          } else {
            wx.showToast({ title: '操作失败: ' + (result.result.msg || '未知错误'), icon: 'none' });
          }
        } catch (err) {
          console.error('[AuditDetail] reject error', err);
          wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
        }
      },
    });
  },
});
