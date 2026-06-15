// pages/admin/api-config.js
const { getStatusBarHeight } = require('../../utils/helpers');

const db = wx.cloud.database();

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    loading: true,
    imageConfigs: [],
    analysisConfigs: [],
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadConfigs();
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadConfigs() {
    this.setData({ loading: true });
    try {
      // 初始化预设（含去重）
      await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'init_api_configs' },
      });

      // 加载图片 API 配置
      const imageRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_api_configs', category: 'image', isAdmin: true },
      });
      const imageData = imageRes.result.data || [];
      const imageConfigs = [...imageData].map(item => ({
        ...item,
        keyVisible: false,
        saving: false,
      }));

      // 加载分析 API 配置
      const analysisRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_api_configs', category: 'analysis', isAdmin: true },
      });
      const analysisData = analysisRes.result.data || [];
      const analysisConfigs = [...analysisData].map(item => ({
        ...item,
        keyVisible: false,
        saving: false,
      }));

      this.setData({ imageConfigs, analysisConfigs, loading: false });
    } catch (e) {
      console.error('[api-config] loadConfigs failed', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onApiKeyInput(e) {
    const { idx, category } = e.currentTarget.dataset;
    const key = category === 'analysis' ? 'analysisConfigs' : 'imageConfigs';
    this.setData({ [`${key}[${idx}].apiKey`]: e.detail.value });
  },

  toggleKeyVisible(e) {
    const { idx, category } = e.currentTarget.dataset;
    const key = category === 'analysis' ? 'analysisConfigs' : 'imageConfigs';
    this.setData({ [`${key}[${idx}].keyVisible`]: !this.data[key][idx].keyVisible });
  },

  async onSaveConfig(e) {
    const { idx, category } = e.currentTarget.dataset;
    const key = category === 'analysis' ? 'analysisConfigs' : 'imageConfigs';
    const config = this.data[key][idx];

    if (!config.apiKey) {
      return wx.showToast({ title: '请输入 API Key', icon: 'none' });
    }

    this.setData({ [`${key}[${idx}].saving`]: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'save_api_config',
          _id: config._id,
          apiKey: config.apiKey,
        },
      });

      this.setData({ [`${key}[${idx}].saving`]: false });

      if (res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.result.msg || '保存失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[api-config] onSaveConfig failed', e);
      this.setData({ [`${key}[${idx}].saving`]: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});
