// pages/agency-pet-detail/agency-pet-detail.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const HEALTH_TYPE_LABEL = {
  weight: '体重', food: '饮食', temperature: '体温',
  vaccine: '疫苗', deworming: '驱虫', checkup: '体检', note: '备注',
};

Page({
  data: {
    loading: true,
    pet: null,
    healthRecords: [],
    healthLoading: false,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  _petId: '',

  onLoad(opts) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    this._petId = opts.petId || '';
    if (this._petId) {
      this.loadPet();
    }
  },

  async loadPet() {
    const db = wx.cloud.database();
    try {
      const res = await db.collection('pets').doc(this._petId).get();
      const pet = res.data || {};
      // 寄养状态
      const STATUS_MAP = {
        agency_foster: { label: '寄养中', color: '#FF9800', bg: '#FFF3E0' },
        pending_foster: { label: '待寄养', color: '#E65100', bg: '#FFF3E0' },
        waiting_pickup: { label: '待取回', color: '#EF6C00', bg: '#FFF8E1' },
        other_foster: { label: '他人寄养', color: '#1565C0', bg: '#E3F2FD' },
      };
      const sc = STATUS_MAP[pet.petStatus];
      if (sc) {
        pet.statusLabel = sc.label;
        pet.statusColor = sc.color;
        pet.statusBg = sc.bg;
      }
      this.setData({ pet, loading: false });
      this.loadHealthRecords();
    } catch (err) {
      console.error('[AgencyPetDetail] loadPet error', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  loadHealthRecords() {
    if (!this._petId) return;
    this.setData({ healthLoading: true });
    const db = wx.cloud.database();
    db.collection('health_records')
      .where({ pet_id: this._petId })
      .orderBy('record_date', 'desc')
      .limit(50)
      .get()
      .then(res => {
        const records = (res.data || []).map(r => ({
          ...r,
          typeLabel: HEALTH_TYPE_LABEL[r.type] || r.type,
          dateStr: this._formatDate(r.record_date),
        }));
        this.setData({ healthRecords: records, healthLoading: false });
      })
      .catch(err => {
        console.warn('[AgencyPetDetail] loadHealthRecords error', err);
        this.setData({ healthLoading: false });
      });
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
