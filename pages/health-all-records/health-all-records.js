const { getStatusBarHeight } = require('../../utils/helpers');

const TYPE_LABEL = {
  weight: '体重',
  vaccine: '疫苗',
  deworming: '驱虫',
  checkup: '体检',
};

Page({
  data: {
    petId: '',
    petName: '',
    petPhoto: '',
    loading: true,
    allRecords: [],
    filteredRecords: [],
    typeFilter: 'all',
    timeFilter: 'all',
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad(options) {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = menuBtn.top + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    if (options.petId) {
      this.setData({ petId: options.petId });
      this.loadData(options.petId);
    } else {
      this.setData({ loading: false });
    }
  },

  async loadData(petId) {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const { data: pet } = await db.collection('pets').doc(petId).get();

      const { data: records } = await db.collection('health_records')
        .where({ pet_id: petId })
        .orderBy('record_date', 'desc')
        .get();

      const processed = records.map(r => ({
        ...r,
        typeLabel: TYPE_LABEL[r.type] || r.type,
        displayValue: this._getDisplayValue(r),
        dateStr: this._formatDate(r.record_date),
      }));

      this.setData({
        petName: pet.name || '宠物',
        petPhoto: pet.photo || '',
        allRecords: processed,
        filteredRecords: processed,
        loading: false,
      });
    } catch (e) {
      console.error('加载记录失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  _getDisplayValue(r) {
    switch (r.type) {
      case 'weight': return (r.value || '-') + ' kg';
      case 'vaccine': return r.name || '疫苗接种';
      case 'deworming': return r.name || '驱虫';
      case 'checkup': return r.name || '体检';
      default: return r.name || '';
    }
  },

  _formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  onTypeFilterChange(e) {
    const typeFilter = e.currentTarget.dataset.type;
    this.setData({ typeFilter }, () => this.applyFilters());
  },

  onTimeFilterChange(e) {
    const timeFilter = e.currentTarget.dataset.time;
    this.setData({ timeFilter }, () => this.applyFilters());
  },

  applyFilters() {
    const { allRecords, typeFilter, timeFilter } = this.data;
    let list = [...allRecords];

    if (typeFilter !== 'all') {
      list = list.filter(r => r.type === typeFilter);
    }

    if (timeFilter !== 'all') {
      const now = new Date();
      const nowTime = now.getTime();
      if (timeFilter === 'week') {
        const weekStart = new Date(nowTime - (now.getDay() || 7) * 86400000);
        weekStart.setHours(0, 0, 0, 0);
        list = list.filter(r => new Date(r.record_date).getTime() >= weekStart.getTime());
      } else if (timeFilter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        list = list.filter(r => new Date(r.record_date).getTime() >= monthStart.getTime());
      }
    }

    this.setData({ filteredRecords: list });
  },

  goBack() {
    wx.navigateBack();
  },
});
