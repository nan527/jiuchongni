// pages/agency-pet-detail/agency-pet-detail.js
const { getStatusBarHeight } = require('../../utils/helpers');
const { resolveTempUrls } = require('../../utils/fileHelper');

const STATUS_CONFIG = {
  agency_foster:   { label: '寄养中',   color: '#FF9800', bg: '#FFF3E0' },
  pending_foster:  { label: '待寄养',   color: '#E65100', bg: '#FFF3E0' },
  waiting_pickup:  { label: '待取回',   color: '#EF6C00', bg: '#FFF8E1' },
  other_foster:    { label: '他人寄养', color: '#1565C0', bg: '#E3F2FD' },
};

const HEALTH_TYPE_LABEL = {
  weight: '体重', food: '饮食', temperature: '体温',
  vaccine: '疫苗', deworming: '驱虫', checkup: '体检', note: '备注',
};

Page({
  data: {
    pet: null,
    statusConfig: null,
    photos: [],
    healthRecords: [],
    healthLoading: true,
    loading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  _petId: '',

  onLoad(opts) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    this._petId = opts.petId || opts.id || '';
    if (this._petId) {
      this.loadPet(this._petId);
      this.loadHealthRecords(this._petId);
    }
  },

  async loadPet(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('pets').doc(id).get();
      const pet = res.data;
      const rawPhotos = pet.photos || (pet.photo ? [pet.photo] : []);
      // 将 cloud:// 文件 ID 转为临时 HTTP URL
      const photos = await resolveTempUrls(rawPhotos);
      this.setData({
        pet,
        photos,
        statusConfig: STATUS_CONFIG[pet.petStatus] || null,
        loading: false,
      });
    } catch (e) {
      this.setData({ pet: null, loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadHealthRecords(petId) {
    this.setData({ healthLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('health_records')
        .where({ pet_id: petId })
        .orderBy('record_date', 'desc')
        .limit(50)
        .get();
      const records = (res.data || []).map(r => ({
        ...r,
        typeLabel: HEALTH_TYPE_LABEL[r.type] || r.type,
        dateStr: this._formatDate(r.record_date),
      }));
      this.setData({ healthRecords: records, healthLoading: false });
    } catch (e) {
      this.setData({ healthLoading: false });
    }
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: this.data.photos, current: url });
    }
  },

  _formatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
  },

  onGoBack() {
    wx.navigateBack();
  },
});
