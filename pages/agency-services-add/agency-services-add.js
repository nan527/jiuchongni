// pages/agency-services-add/agency-services-add.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const UNIT_OPTIONS = ['/次', '/天', '/针', '/月', '/只'];

const CATEGORIES = [
  { key: 'foster',   title: '宠物寄养', icon: 'home-o' },
  { key: 'grooming', title: '美容洗护', icon: 'diamond-o' },
  { key: 'medical',  title: '医疗健康', icon: 'medal-o' },
  { key: 'door',     title: '上门服务', icon: 'logistics' },
];

const TEMPLATES = {
  foster: [
    { name: '日托寄养（白天临时看管）', unit: '/天' },
    { name: '长期寄宿寄养（多天/长假托管）', unit: '/天' },
    { name: '单独隔离寄养（病宠隔离）', unit: '/天' },
    { name: '日常喂养、定时遛宠', unit: '/次' },
    { name: '每日健康打卡、视频反馈', unit: '/天' },
    { name: '特殊宠物照料（幼宠/老年宠/病弱宠）', unit: '/天' },
  ],
  grooming: [
    { name: '全身洗澡、除菌除臭', unit: '/次' },
    { name: '宠物剪毛、造型修剪', unit: '/次' },
    { name: '指甲修剪、耳道清洁', unit: '/次' },
    { name: '脚底毛修剪、肛门腺清理', unit: '/次' },
    { name: '毛发护理、药浴皮肤护理', unit: '/次' },
  ],
  medical: [
    { name: '日常体检、基础问诊', unit: '/次' },
    { name: '疫苗接种', unit: '/针' },
    { name: '驱虫服务（体内外）', unit: '/次' },
    { name: '皮肤病、常见病诊疗', unit: '/次' },
    { name: '外伤处理、简单护理', unit: '/次' },
    { name: '绝育手术', unit: '/次' },
    { name: '宠物健康档案建立、复诊跟踪', unit: '/次' },
  ],
  door: [
    { name: '上门遛狗、上门喂食', unit: '/次' },
    { name: '上门简单洗护', unit: '/次' },
    { name: '上门寄养临时照料', unit: '/天' },
  ],
};

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    categories: CATEGORIES,
    unitOptions: UNIT_OPTIONS,
    selectedCat: '',
    isCustomMode: false,
    currentTemplates: [],
    form: { name: '', desc: '', price: '' },
    imageList: [],
    imageUrls: [],
    unitIdx: 0,
    saving: false,
    profileId: '',
    isEdit: false,
    editId: '',
    editingTpl: null,
  },

  async onLoad(opts) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    if (opts.profileId) {
      this.setData({ profileId: opts.profileId });
    }

    // 编辑模式
    if (opts.editId) {
      this.setData({ isEdit: true, editId: opts.editId });
      await this.loadEditData(opts.editId);
    }
  },

  onGoBack() {
    wx.navigateBack();
  },

  async loadEditData(id) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('agency_services').doc(id).get();
      const svc = res.data;
      const unitIdx = UNIT_OPTIONS.indexOf(svc.unit);
      const images = svc.images || [];
      this.setData({
        selectedCat: svc.category,
        isCustomMode: true,
        currentTemplates: TEMPLATES[svc.category] || [],
        form: { name: svc.name, desc: svc.desc || '', price: String(svc.price) },
        unitIdx: unitIdx >= 0 ? unitIdx : 0,
        imageUrls: images,
        imageList: images.map(url => ({ url })),
      });
    } catch (err) {
      console.error('[AddService] 加载编辑数据失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onSelectCat(e) {
    const key = e.currentTarget.dataset.key;
    const tpls = TEMPLATES[key] || [];
    this.setData({
      selectedCat: key,
      isCustomMode: false,
      currentTemplates: tpls,
      form: { name: '', desc: '', price: '' },
      unitIdx: 0,
      imageList: [],
      imageUrls: [],
      editingTpl: null,
    });
  },

  /** 点击模板项 → 进入详情编辑 */
  onEditTpl(e) {
    const idx = e.currentTarget.dataset.idx;
    const tpl = this.data.currentTemplates[idx];
    const unitIdx = UNIT_OPTIONS.indexOf(tpl.unit);
    this.setData({
      editingTpl: idx,
      form: { name: tpl.name, desc: '', price: '' },
      unitIdx: unitIdx >= 0 ? unitIdx : 0,
      imageList: [],
      imageUrls: [],
    });
  },

  onCustomMode() {
    this.setData({
      isCustomMode: true,
      form: { name: '', desc: '', price: '' },
      unitIdx: 0,
      imageList: [],
      imageUrls: [],
    });
  },

  onBackToTpls() {
    this.setData({
      isCustomMode: false,
      editingTpl: null,
    });
  },

  onNameInput(e) { this.setData({ 'form.name': e.detail }); },
  onDescInput(e) { this.setData({ 'form.desc': e.detail }); },
  onPriceInput(e) { this.setData({ 'form.price': e.detail }); },
  onUnitChange(e) { this.setData({ unitIdx: Number(e.detail.value) }); },

  async afterReadImage(e) {
    const file = e.detail.file;
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const cloudPath = `agency/services/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: file.url });
      const imageUrls = this.data.imageUrls.concat(uploadRes.fileID);
      const imageList = this.data.imageList.concat({ url: file.url, cloudUrl: uploadRes.fileID });
      this.setData({ imageUrls, imageList });
    } catch (err) {
      console.error('[AddService] 图片上传失败', err);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDeleteImage(e) {
    const idx = e.detail.index;
    const imageUrls = this.data.imageUrls.slice();
    const imageList = this.data.imageList.slice();
    imageUrls.splice(idx, 1);
    imageList.splice(idx, 1);
    this.setData({ imageUrls, imageList });
  },

  validate() {
    const f = this.data.form;
    if (!f.name.trim()) return '请输入服务名称';
    if (!f.price || isNaN(parseFloat(f.price))) return '请输入有效价格';
    const p = parseFloat(f.price);
    if (p < 0) return '价格不能为负数';
    return '';
  },

  /** 统一提交（模板编辑 / 自定义 / 编辑模式共用） */
  async onSubmit() {
    const msg = this.validate();
    if (msg) {
      wx.showToast({ title: msg, icon: 'none', duration: 2000 });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      const f = this.data.form;
      const unit = UNIT_OPTIONS[this.data.unitIdx];
      const record = {
        category: this.data.selectedCat,
        name: f.name.trim(),
        desc: f.desc.trim(),
        price: parseFloat(f.price),
        unit,
        images: this.data.imageUrls,
        agencyProfileId: this.data.profileId,
        updateTime: db.serverDate(),
      };

      if (this.data.isEdit) {
        await db.collection('agency_services').doc(this.data.editId).update({ data: record });
      } else {
        record.createTime = db.serverDate();
        await db.collection('agency_services').add({ data: record });
      }

      wx.showToast({ title: this.data.isEdit ? '修改成功' : '添加成功', icon: 'success' });

      if (this.data.isEdit) {
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        // 非编辑模式：保存后返回模板列表，可继续添加
        this.setData({
          editingTpl: null,
          isCustomMode: false,
          form: { name: '', desc: '', price: '' },
          unitIdx: 0,
          imageList: [],
          imageUrls: [],
        });
      }
    } catch (err) {
      console.error('[AddService] 保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  /** 批量快速添加全部模板（无描述、无图片，仅填价格） */
  async onBatchQuickAdd() {
    const tpls = this.data.currentTemplates;
    if (tpls.length === 0) {
      wx.showToast({ title: '该分类暂无模板', icon: 'none' });
      return;
    }

    if (this.data.saving) return;

    wx.showModal({
      title: '批量快速添加',
      content: `将为该分类下全部 ${tpls.length} 项模板创建服务（无描述和图片，后续可单独编辑）`,
      confirmText: '确认添加',
      confirmColor: '#FF9800',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ saving: true });

        try {
          const db = wx.cloud.database();
          const batch = [];

          for (const tpl of tpls) {
            const record = {
              category: this.data.selectedCat,
              name: tpl.name,
              desc: '',
              price: 0,
              unit: tpl.unit,
              images: [],
              agencyProfileId: this.data.profileId,
              updateTime: db.serverDate(),
              createTime: db.serverDate(),
            };
            batch.push(db.collection('agency_services').add({ data: record }));
          }

          await Promise.all(batch);
          wx.showToast({ title: `成功添加 ${batch.length} 项服务`, icon: 'success' });
        } catch (err) {
          console.error('[AddService] 批量添加失败', err);
          wx.showToast({ title: '添加失败', icon: 'none' });
        } finally {
          this.setData({ saving: false });
        }
      },
    });
  },
});
