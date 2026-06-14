// pages/admin/api-config.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const db = wx.cloud.database();

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    loading: true,
    imageConfigs: [],
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
    const db = wx.cloud.database();
    try {
      // 先尝试初始化（首次使用）
      await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'init_api_configs' },
      });

      // 补建缺失的预设记录
      const presets = [
        { category: 'image', provider: 'siliconflow', model: 'Kwai-Kolors/Kolors', modelName: '快手 Kolors', tier: 'low', apiKey: '', enabled: true, dailyFreeQuota: 5, pricePerUse: 0.01 },
        { category: 'image', provider: 'siliconflow', model: 'Qwen/Qwen-Image-Edit-2509', modelName: '通义千问', tier: 'medium', apiKey: '', enabled: true, dailyFreeQuota: 0, pricePerUse: 0.50 },
        { category: 'image', provider: 'siliconflow', model: 'stabilityai/stable-diffusion-xl-base-1.0', modelName: 'SDXL (高清)', tier: 'high', apiKey: '', enabled: true, dailyFreeQuota: 0, pricePerUse: 1.00 },
      ];
      for (const p of presets) {
        const existing = await db.collection('api_configs').where({ model: p.model }).get();
        if (!existing.data || existing.data.length === 0) {
          await db.collection('api_configs').add({ data: { ...p, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_api_configs', category: 'image', isAdmin: true },
      });

      const raw = res.result.data || [];
      const high = raw.filter(m => m.tier === 'high');
      const medium = raw.filter(m => m.tier === 'medium');
      const low = raw.filter(m => m.tier === 'low');
      const configs = [...high, ...medium, ...low].map(item => ({
        ...item,
        keyVisible: false,
        saving: false,
      }));

      this.setData({ imageConfigs: configs, loading: false });
    } catch (e) {
      console.error('[api-config] loadConfigs failed', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onApiKeyInput(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`imageConfigs[${idx}].apiKey`]: e.detail.value });
  },

  toggleKeyVisible(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `imageConfigs[${idx}].keyVisible`;
    this.setData({ [key]: !this.data.imageConfigs[idx].keyVisible });
  },

  async onSaveConfig(e) {
    const idx = e.currentTarget.dataset.idx;
    const config = this.data.imageConfigs[idx];

    if (!config.apiKey) {
      return wx.showToast({ title: '请输入 API Key', icon: 'none' });
    }

    this.setData({ [`imageConfigs[${idx}].saving`]: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'save_api_config',
          _id: config._id,
          apiKey: config.apiKey,
        },
      });

      this.setData({ [`imageConfigs[${idx}].saving`]: false });

      if (res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.result.msg || '保存失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[api-config] onSaveConfig failed', e);
      this.setData({ [`imageConfigs[${idx}].saving`]: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});
