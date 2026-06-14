// pages/ai/ai.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const db = wx.cloud.database();

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    myPets: [],

    // 弹窗控制
    showAvatar: false,

    // 图片上传
    avatarOriginalUrl: '',
    avatarOriginalFileID: '',

    // 风格与提示词
    avatarStyle: '',
    avatarStyleName: '',
    customPrompt: '',

    // 模型选择
    selectedModel: '',
    aiModels: [],

    // 生成状态
    avatarLoading: false,
    avatarGenerated: false,
    avatarPreviewUrl: '',
    resultFileID: '',

    // 风格列表
    avatarStyles: [
      { key: 'cartoon', name: '可爱卡通', icon: 'smile-o', bg: '#FFF3E0', color: '#FF9800' },
      { key: 'watercolor', name: '水彩手绘', icon: 'brush-o', bg: '#E3F2FD', color: '#2196F3' },
      { key: 'pixel', name: '像素风', icon: 'gem-o', bg: '#FFF3E0', color: '#FF9800' },
      { key: 'oil', name: '油画风', icon: 'photo-o', bg: '#E8F5E9', color: '#66BB6A' },
      { key: 'anime', name: '日系动漫', icon: 'star-o', bg: '#FFF3E0', color: '#FF7043' },
      { key: 'cyber', name: '赛博朋克', icon: 'fire-o', bg: '#E0F7FA', color: '#00BCD4' },
    ],

    // 我的作品
    myWorks: [],
    shareWorkUrl: '',
    batchMode: false,
    selectedWorks: [],
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadMyPets();
    this.loadMyWorks();
    this.loadApiConfigs();
  },

  onGoBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    const shareUrl = this.data.shareWorkUrl || this.data.avatarPreviewUrl || '';
    return {
      title: '看看我的AI数字分身！',
      path: '/pages/ai/ai',
      imageUrl: shareUrl,
    };
  },

  async loadMyPets() {
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo) return;

      const petsRes = await db.collection('pets')
        .where({ ownerId: userInfo._id })
        .orderBy('createTime', 'desc')
        .limit(10)
        .get();

      const pets = (petsRes.data || []).map(p => ({
        name: p.name,
        breed: p.breed || p.species || '',
        avatar: p.avatar || '',
        _id: p._id,
        character: p.character || '',
        age: p.age || '',
      }));

      this.setData({ myPets: pets });
    } catch (e) {
      console.error('[AI] loadMyPets failed', e);
    }
  },

  async loadMyWorks() {
    try {
      const res = await db.collection('ai_works')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      this.setData({ myWorks: res.data || [] });
    } catch (e) {
      console.error('[AI] loadMyWorks failed', e);
    }
  },

  previewWork(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url] });
    }
  },

  deleteWork(e) {
    const { id, idx } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除作品',
      content: '确定要删除这个作品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.collection('ai_works').doc(id).remove();
            const myWorks = this.data.myWorks.filter((_, i) => i !== idx);
            this.setData({ myWorks });
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  onWorkShare(e) {
    const url = e.currentTarget.dataset.url;
    this.setData({ shareWorkUrl: url });
  },

  onWorkTap(e) {
    const { url, id, idx } = e.currentTarget.dataset;
    if (this.data.batchMode) {
      const selected = [...this.data.selectedWorks];
      const pos = selected.indexOf(id);
      if (pos >= 0) {
        selected.splice(pos, 1);
      } else {
        selected.push(id);
      }
      this.setData({ selectedWorks: selected });
    } else {
      wx.previewImage({ urls: [url] });
    }
  },

  onWorkLongPress(e) {
    const { url, id, idx } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['分享给好友', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ shareWorkUrl: url });
        } else if (res.tapIndex === 1) {
          this._confirmDelete(id, idx);
        }
      },
    });
  },

  _confirmDelete(id, idx) {
    wx.showModal({
      title: '删除作品',
      content: '确定要删除这个作品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.collection('ai_works').doc(id).remove();
            const myWorks = this.data.myWorks.filter((_, i) => i !== idx);
            this.setData({ myWorks });
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  enterBatchMode() {
    this.setData({ batchMode: true, selectedWorks: [] });
  },

  exitBatchMode() {
    this.setData({ batchMode: false, selectedWorks: [] });
  },

  batchDeleteWorks() {
    const { selectedWorks, myWorks } = this.data;
    if (selectedWorks.length === 0) {
      return wx.showToast({ title: '请先选择作品', icon: 'none' });
    }
    wx.showModal({
      title: '批量删除',
      content: `确定要删除选中的 ${selectedWorks.length} 个作品吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const dbCmd = db.command;
            await db.collection('ai_works').where({
              _id: dbCmd.in(selectedWorks),
            }).remove();
            const remaining = myWorks.filter(w => !selectedWorks.includes(w._id));
            this.setData({ myWorks: remaining, batchMode: false, selectedWorks: [] });
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  openModule(e) {
    const module = e.currentTarget.dataset.module;
    this.setData({ [`show${module.charAt(0).toUpperCase() + module.slice(1)}`]: true });
  },

  closeModule() {
    this.setData({ showAvatar: false });
  },

  // ==================== 数字分身 ====================

  chooseAvatarPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ avatarOriginalUrl: tempFilePath, avatarOriginalFileID: '', avatarGenerated: false, avatarPreviewUrl: '' });
      },
    });
  },

  onAvatarStyleSelect(e) {
    const style = e.currentTarget.dataset.style;
    const styleObj = this.data.avatarStyles.find(s => s.key === style);
    this.setData({ avatarStyle: style, avatarStyleName: styleObj ? styleObj.name : '' });
  },

  onPromptInput(e) {
    this.setData({ customPrompt: e.detail.value });
  },

  async loadApiConfigs() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'get_api_configs', category: 'image' },
      });
      const raw = res.result.data || [];
      // 强制按 high → medium → low 排序
      const high = raw.filter(m => m.tier === 'high' && m.enabled);
      const medium = raw.filter(m => m.tier === 'medium' && m.enabled);
      const low = raw.filter(m => m.tier === 'low' && m.enabled);
      const models = [...high, ...medium, ...low];

      // 查询每个模型的今日剩余次数
      const modelsWithQuota = await Promise.all(models.map(async (m) => {
        const quotaRes = await wx.cloud.callFunction({
          name: 'ai_handler',
          data: { action: 'check_quota', model: m.model },
        });
        return {
          ...m,
          remaining: quotaRes.result.remaining || 0,
        };
      }));

      this.setData({
        aiModels: modelsWithQuota,
        selectedModel: modelsWithQuota.length > 0 ? modelsWithQuota[0].model : '',
      });
    } catch (e) {
      console.error('[AI] loadApiConfigs failed', e);
    }
  },

  onModelSelect(e) {
    this.setData({ selectedModel: e.currentTarget.dataset.model });
  },

  async generateAvatar() {
    if (!this.data.avatarOriginalUrl) {
      return wx.showToast({ title: '请先上传照片', icon: 'none' });
    }
    if (!this.data.avatarStyle) {
      return wx.showToast({ title: '请选择风格', icon: 'none' });
    }
    if (!this.data.selectedModel) {
      return wx.showToast({ title: '请选择模型', icon: 'none' });
    }

    this.setData({ avatarLoading: true, avatarGenerated: false, avatarPreviewUrl: '' });

    try {
      // 检查额度
      const quotaRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: { action: 'check_quota', model: this.data.selectedModel },
      });
      const quota = quotaRes.result;

      if (quota.exceeded) {
        // 检查余额是否充足
        const balanceRes = await wx.cloud.callFunction({
          name: 'ai_handler',
          data: { action: 'get_user_balance' },
        });
        const balance = balanceRes.result.balance || 0;
        if (balance < quota.pricePerUse) {
          this.setData({ avatarLoading: false });
          wx.showModal({
            title: '免费额度已用完',
            content: `今日免费次数已用完，继续使用需支付 ${quota.pricePerUse} 元。当前余额 ¥${balance.toFixed(2)}，余额不足，请先充值。`,
            confirmText: '去充值',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({ url: '/pages/balance/balance' });
              }
            },
          });
          return;
        }
      }

      // 上传原图到云存储
      let fileID = this.data.avatarOriginalFileID;
      if (!fileID) {
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `avatar_uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
          filePath: this.data.avatarOriginalUrl,
        });
        fileID = uploadRes.fileID;
        this.setData({ avatarOriginalFileID: fileID });
      }

      // 获取临时 URL 给云函数
      const fileRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const imageUrl = fileRes.fileList[0].tempFileURL;

      // 构建提示词
      const styleName = this.data.avatarStyleName;
      const basePrompt = `将这张宠物照片转换为${styleName}风格`;
      const prompt = this.data.customPrompt
        ? `${basePrompt}，${this.data.customPrompt}`
        : basePrompt;

      // 调用云函数生成图片（apiKey 从云数据库读取）
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'generate_image',
          model: this.data.selectedModel,
          imageUrl,
          prompt,
          style: this.data.avatarStyle,
        },
      });

      const result = res.result || {};
      if (result.success && result.imageUrl) {
        // 记录使用次数
        await wx.cloud.callFunction({
          name: 'ai_handler',
          data: { action: 'use_quota', model: this.data.selectedModel },
        });

        // 如果超出免费额度，扣费
        if (quota.exceeded) {
          const modelConfig = this.data.aiModels.find(m => m.model === this.data.selectedModel);
          await wx.cloud.callFunction({
            name: 'ai_handler',
            data: {
              action: 'deduct_balance',
              amount: modelConfig.pricePerUse,
              description: `AI生图-${modelConfig.modelName}`,
            },
          });
        }

        // 刷新额度显示
        this.loadApiConfigs();

        this.setData({
          avatarLoading: false,
          avatarGenerated: true,
          avatarPreviewUrl: result.imageUrl,
          resultFileID: result.fileID || '',
        });
        wx.showToast({ title: '生成成功', icon: 'success' });
      } else {
        this.setData({ avatarLoading: false });
        wx.showToast({ title: result.msg || '生成失败，请联系管理员检查 API 配置', icon: 'none' });
      }
    } catch (e) {
      console.error('[AI] generateAvatar failed', e);
      this.setData({ avatarLoading: false });
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    }
  },

  previewResult() {
    if (this.data.avatarPreviewUrl) {
      wx.previewImage({ urls: [this.data.avatarPreviewUrl] });
    }
  },

  onShareTap() {
    // 触发转发菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage'],
    });
  },

  async saveToWorks() {
    if (!this.data.avatarPreviewUrl) {
      return wx.showToast({ title: '没有可保存的作品', icon: 'none' });
    }

    try {
      wx.showLoading({ title: '保存中...' });

      // 通过云函数下载图片并上传到云存储（绕过域名白名单限制）
      const res = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'download_and_save',
          imageUrl: this.data.avatarPreviewUrl,
        },
      });

      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.msg || '保存失败');
      }

      // 写入云数据库
      await db.collection('ai_works').add({
        data: {
          type: 'avatar',
          style: this.data.avatarStyle,
          styleName: this.data.avatarStyleName,
          prompt: this.data.customPrompt,
          originalFileID: this.data.avatarOriginalFileID,
          resultFileID: result.fileID,
          resultUrl: this.data.avatarPreviewUrl,
          createdAt: db.serverDate(),
        },
      });

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.loadMyWorks();
    } catch (e) {
      console.error('[AI] saveToWorks failed', e);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});
