// pages/ai/ai.js
const authService = require('../../services/authService');

const MATCH_REASONS = [
  '综合评分最高，环境和服务都很出色',
  '距离最近，交通便利，口碑良好',
  '擅长照顾{breed}，用户好评率95%',
  '价格合理，服务全面，性价比高',
  '专业{breed}护理团队，经验丰富',
  '环境干净卫生，宠物活动空间大',
  '提供24小时视频监控，随时查看宠物',
  '有专业的宠物医疗团队，安全有保障',
];

const CAPTION_TEMPLATES = [
  '阳光洒在{name}身上，这一刻，时光都变得温柔了。',
  '{name}的小眼神，仿佛在说"铲屎官，快来摸我！"',
  '记录{name}的日常，每一帧都是心动的感觉～',
  '有{name}陪伴的日子，连空气都是甜的。',
  '{name}今天也是元气满满的小可爱呢！',
  '生活不止眼前的苟且，还有{name}和远方。',
];

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    myPets: [],

    // 弹窗控制
    showMatch: false,
    showAlbum: false,
    showAvatar: false,
    showDashboard: false,

    // AI 匹配
    matchPetIdx: -1,
    matchPrefs: [],
    matchLoading: false,
    matchResults: [],
    matchTried: false,
    prefOptions: ['环境好', '价格实惠', '距离近', '口碑好', '专业护理', '24h监控', '医疗配套', '接送服务'],

    // 宠物相册
    albumTab: 0,
    albumPhotos: [],
    captionPhotoIdx: -1,
    captionLoading: false,
    captionResult: '',

    // 数字分身
    avatarStyle: '',
    avatarStyleName: '',
    avatarLoading: false,
    avatarGenerated: false,
    avatarPreviewUrl: '',
    avatarStyles: [
      { key: 'cartoon', name: '可爱卡通', icon: 'smile-o', bg: '#FFF3E0', color: '#FF9800' },
      { key: 'watercolor', name: '水彩手绘', icon: 'brush-o', bg: '#E3F2FD', color: '#2196F3' },
      { key: 'pixel', name: '像素风', icon: 'gem-o', bg: '#FFF3E0', color: '#FF9800' },
      { key: 'oil', name: '油画风', icon: 'photo-o', bg: '#E8F5E9', color: '#66BB6A' },
      { key: 'anime', name: '日系动漫', icon: 'star-o', bg: '#FFF3E0', color: '#FF7043' },
      { key: 'cyber', name: '赛博朋克', icon: 'fire-o', bg: '#E0F7FA', color: '#00BCD4' },
    ],

    // 数据看板
    dashData: {
      monthExpense: 1280,
      expenseTrend: 15,
      healthScore: 96,
      serviceCount: 8,
      fosterDays: 23,
      serviceDist: { foster: 45, grooming: 25, medical: 20, other: 10 },
    },
    expenseChartData: [
      { month: 1, value: 580, percent: 30 },
      { month: 2, value: 820, percent: 42 },
      { month: 3, value: 1100, percent: 57 },
      { month: 4, value: 760, percent: 39 },
      { month: 5, value: 1500, percent: 78 },
      { month: 6, value: 1280, percent: 66 },
    ],
    healthChartData: [
      { month: 1, score: 92 },
      { month: 2, score: 94 },
      { month: 3, score: 90 },
      { month: 4, score: 95 },
      { month: 5, score: 93 },
      { month: 6, score: 96 },
    ],
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadMyPets();
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadMyPets() {
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo) return;
      const db = wx.cloud.database();
      const res = await db.collection('pets')
        .where({ ownerId: userInfo._id })
        .orderBy('createTime', 'desc')
        .limit(10)
        .get();
      const pets = (res.data || []).map(p => ({
        name: p.name,
        breed: p.breed || '',
        avatar: p.avatar || '',
        _id: p._id,
      }));
      this.setData({ myPets: pets });
    } catch (e) {
      console.error('[AI] loadMyPets failed', e);
    }
  },

  openModule(e) {
    const module = e.currentTarget.dataset.module;
    this.setData({ [`show${module.charAt(0).toUpperCase() + module.slice(1)}`]: true });
  },

  closeModule() {
    this.setData({ showMatch: false, showAlbum: false, showAvatar: false, showDashboard: false });
  },

  // ==================== AI 智能匹配 ====================

  onMatchPetSelect(e) {
    this.setData({ matchPetIdx: e.currentTarget.dataset.idx });
  },

  onPrefToggle(e) {
    const pref = e.currentTarget.dataset.pref;
    const list = this.data.matchPrefs.slice();
    const idx = list.indexOf(pref);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(pref);
    this.setData({ matchPrefs: list });
  },

  startMatch() {
    if (this.data.matchPetIdx < 0) {
      return wx.showToast({ title: '请先选择宠物', icon: 'none' });
    }
    if (this.data.matchPrefs.length === 0) {
      return wx.showToast({ title: '请至少选择一个偏好', icon: 'none' });
    }

    this.setData({ matchLoading: true, matchResults: [], matchTried: false });

    const pet = this.data.myPets[this.data.matchPetIdx];
    const prefs = this.data.matchPrefs;

    // 模拟匹配结果
    setTimeout(() => {
      const agencies = [
        { name: '萌宠乐园寄养中心', score: 96 },
        { name: '爱宠之家宠物医院', score: 93 },
        { name: '毛孩子精品护理', score: 90 },
        { name: '宠物星球综合服务', score: 87 },
        { name: '温馨小窝寄养', score: 84 },
      ];

      const results = agencies.slice(0, 3).map((a, i) => {
        const reason = MATCH_REASONS[Math.floor(Math.random() * MATCH_REASONS.length)]
          .replace(/\{breed\}/g, pet.breed || '宠物');
        return { ...a, reason };
      });

      this.setData({ matchLoading: false, matchResults: results, matchTried: true });
    }, 1500);
  },

  // ==================== 宠物相册 ====================

  onAlbumTab(e) {
    this.setData({ albumTab: Number(e.currentTarget.dataset.tab) });
  },

  addAlbumPhoto() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFiles.map(f => ({ url: f.tempFilePath, caption: '' }));
        this.setData({ albumPhotos: this.data.albumPhotos.concat(newPhotos) });
      },
    });
  },

  onCaptionPhotoSelect(e) {
    this.setData({ captionPhotoIdx: e.currentTarget.dataset.idx, captionResult: '' });
  },

  generateAlbumCaption() {
    if (this.data.albumPhotos.length === 0) {
      return wx.showToast({ title: '请先添加照片', icon: 'none' });
    }
    const petName = this.data.myPets.length > 0 ? this.data.myPets[0].name : '小可爱';
    const photos = this.data.albumPhotos.map((p, i) => {
      const caption = CAPTION_TEMPLATES[Math.floor(Math.random() * CAPTION_TEMPLATES.length)]
        .replace(/\{name\}/g, petName);
      return { ...p, caption };
    });
    this.setData({ albumPhotos: photos });
    wx.showToast({ title: '配文生成成功', icon: 'success' });
  },

  generatePhotoCaption() {
    const { captionPhotoIdx, albumPhotos, myPets } = this.data;
    if (captionPhotoIdx < 0 || captionPhotoIdx >= albumPhotos.length) {
      return wx.showToast({ title: '请先选择照片', icon: 'none' });
    }
    this.setData({ captionLoading: true, captionResult: '' });
    const petName = myPets.length > 0 ? myPets[0].name : '小可爱';
    setTimeout(() => {
      const caption = CAPTION_TEMPLATES[Math.floor(Math.random() * CAPTION_TEMPLATES.length)]
        .replace(/\{name\}/g, petName);
      this.setData({ captionLoading: false, captionResult: caption });
    }, 1200);
  },

  onCopyCaption() {
    wx.setClipboardData({
      data: this.data.captionResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  shareAlbum() {
    wx.showToast({ title: '分享功能开发中', icon: 'none' });
  },

  createSlideshow() {
    wx.showToast({ title: '影集生成功能开发中', icon: 'none' });
  },

  shareSlideshow() {
    wx.showToast({ title: '分享功能开发中', icon: 'none' });
  },

  // ==================== 数字分身 ====================

  onAvatarStyleSelect(e) {
    const style = e.currentTarget.dataset.style;
    const styleObj = this.data.avatarStyles.find(s => s.key === style);
    this.setData({ avatarStyle: style, avatarStyleName: styleObj ? styleObj.name : '' });
  },

  generateAvatar() {
    if (!this.data.avatarStyle) {
      return wx.showToast({ title: '请选择风格', icon: 'none' });
    }
    this.setData({ avatarLoading: true, avatarGenerated: false, avatarPreviewUrl: '' });

    // 模拟生成
    setTimeout(() => {
      this.setData({
        avatarLoading: false,
        avatarGenerated: true,
        avatarPreviewUrl: '/static/pet/logo.png',
      });
      wx.showToast({ title: '生成成功', icon: 'success' });
    }, 2000);
  },

  saveAvatar() {
    wx.showToast({ title: '已保存到相册', icon: 'success' });
  },

  shareAvatar() {
    wx.showToast({ title: '分享功能开发中', icon: 'none' });
  },
});
