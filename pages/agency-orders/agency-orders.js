// pages/agency-orders/agency-orders.js
const authService = require('../../services/authService');
const { formatDate, buildLeaveRemainText, isLeaveExpired, getStatusBarHeight } = require('../../utils/helpers');

const STATUS_LABEL = {
  confirmed: '接单',
  in_progress: '开始服务',
  to_confirm: '完成服务',
  cancelled: '拒绝',
};

const FOSTER_STATUS_LABEL = {
  confirmed: '开始寄养',
  in_progress: '寄养服务',
  to_confirm: '完成寄养（待取回）',
  cancelled: '拒绝',
};

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    activeTab: 0,
    loading: true,
    allOrders: [],
    pendingList: [],
    activeList: [],
    toConfirmList: [],
    completedList: [],
    // 快递订单
    orderViewType: 'agency',
    expressPendingList: [],
    expressShippedList: [],
    expressToPickupList: [],
    expressCompletedList: [],
    totalRevenue: '0.00',
    totalOrders: 0,
    completedOrders: 0,
    cageSummary: {
      totalCages: 0,
      occupiedCages: 0,
      availableCages: 0,
      cageDesc: '',
    },
    petFilter: 'all',
    leftPetCount: 0,
    occupiedPetsAll: [],
    occupiedPets: [],
    // 健康录入
    showHealthPopup: false,
    healthPetId: '',
    healthPetName: '',
    healthType: 'weight',
    healthTypeOptions: [
      { key: 'weight', label: '体重' },
      { key: 'temperature', label: '体温' },
      { key: 'food', label: '饮食' },
      { key: 'vaccine', label: '疫苗' },
      { key: 'deworming', label: '驱虫' },
      { key: 'checkup', label: '体检' },
      { key: 'note', label: '备注' },
    ],
    healthHistory: [],
    healthHistoryLoading: false,
    // 通用
    healthValue: '',
    healthNote: '',
    healthSaving: false,
    // 疫苗
    healthVaccineName: '',
    healthInstitution: '',
    healthNextDate: '',
    // 驱虫
    healthMedicineName: '',
    // 体检
    healthCheckupResult: '',
    // 饮食
    healthFoodIntake: '',
  },

  _agencyProfileId: '',
  _leaveTickTimer: null,

  _getStatusBarHeight() {
    return getStatusBarHeight();
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onShow() {
    const statusBarHeight = this._getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._agencyProfileId = userInfo.agencyProfileId || '';
    if (!this._agencyProfileId) {
      wx.showToast({ title: '未找到机构信息', icon: 'none' });
      return;
    }
    this._startLeaveTick();
    this.loadOrders();
  },

  onHide() {
    this._stopLeaveTick();
  },

  onUnload() {
    this._stopLeaveTick();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.index });
  },

  onOrderViewTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ orderViewType: type, activeTab: 0 });
  },

  onChangePetFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter) return;
    this.setData({ petFilter: filter }, () => this._applyOccupiedFilter());
  },

  onViewOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
  },

  async loadOrders() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    let list = [];
    let profile = {};
    let expressRes = { data: [] };

    try {
      const res = await db.collection('user_orders')
        .where({
          orderType: 'agency',
          agencyProfileId: this._agencyProfileId,
        })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();

      try {
        expressRes = await db.collection('user_orders')
          .where({
            orderType: 'express',
            agencyProfileId: this._agencyProfileId,
          })
          .orderBy('createTime', 'desc')
          .limit(100)
          .get();
      } catch (e) { /* express 查询失败忽略 */ }

      let profileRes = { data: {} };
      try {
        profileRes = await db.collection('agency_profiles').doc(this._agencyProfileId).get();
      } catch (e) { /* profile 查询失败忽略 */ }

      profile = profileRes.data || {};
      list = (res.data || []).map(item => ({
        ...item,
        createTimeStr: formatDate(item.createTime),
        leaveRemainText: buildLeaveRemainText(item.leaveTimeMs),
        isLeaveExpired: isLeaveExpired(item.leaveTimeMs),
      }));
    } catch (e) {
      console.warn('[AgencyOrders] load', e);
    }

    const occupiedFosterOrders = list.filter(o =>
      o.category === 'foster' && ['confirmed', 'in_progress', 'to_confirm'].includes(o.orderStatus)
    );
    const totalCages = Number(profile.totalCages) || 0;
    const occupiedCages = occupiedFosterOrders.filter(o => !o.isLeaveExpired).length;
    const availableCages = Math.max(0, totalCages - occupiedCages);
    const occupiedPets = occupiedFosterOrders.map(o => ({
      id: o._id,
      petName: o.petName || '未命名宠物',
      species: (o.petInfo && o.petInfo.species) || '',
      age: (o.petInfo && o.petInfo.age) || '',
      status: o.orderStatus,
      isLeft: !!o.isLeaveExpired,
      leaveRemainText: o.leaveRemainText || '未设置离开时间',
      image: (o.petInfo && o.petInfo.photo) || (o.images && o.images[0]) || '/static/pet/logo.png',
    }));
    const leftPetCount = occupiedPets.filter(p => p.isLeft).length;

    // 计算收入
    const completed = list.filter(o => o.orderStatus === 'completed');
    let totalRevenue = 0;
    completed.forEach(o => {
      totalRevenue += parseFloat(o.price) || 0;
    });

    // 处理快递订单
    const expressList = (expressRes.data || []).map(item => ({
      ...item,
      createTimeStr: formatDate(item.createTime),
    }));

    this.setData({
      allOrders: list,
      pendingList: list.filter(o => o.orderStatus === 'pending'),
      activeList: list.filter(o => o.orderStatus === 'confirmed' || o.orderStatus === 'in_progress'),
      toConfirmList: list.filter(o => o.orderStatus === 'to_confirm'),
      completedList: completed,
      expressPendingList: expressList.filter(o => o.orderStatus === 'pending_ship'),
      expressShippedList: expressList.filter(o => o.orderStatus === 'shipped'),
      expressToPickupList: expressList.filter(o => o.orderStatus === 'to_pickup'),
      expressCompletedList: expressList.filter(o => o.orderStatus === 'completed'),
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders: list.length,
      completedOrders: completed.length,
      cageSummary: {
        totalCages,
        occupiedCages,
        availableCages,
        cageDesc: profile.cageDesc || '',
      },
      leftPetCount,
      occupiedPetsAll: occupiedPets,
      occupiedPets,
      loading: false,
    });
    this._applyOccupiedFilter();
  },

  onUpdateStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const targetOrderForLabel = this.data.allOrders.find(o => o._id === id);
    const isFoster = targetOrderForLabel && targetOrderForLabel.category === 'foster';
    const label = (isFoster ? FOSTER_STATUS_LABEL[status] : STATUS_LABEL[status]) || '更新';
    const isReject = status === 'cancelled';

    wx.showModal({
      title: isReject ? '确认拒绝' : `确认${label}`,
      content: isReject ? '拒绝后该订单将被取消，确定吗？' : `确认${label}该订单？`,
      confirmColor: isReject ? '#ee0a24' : '#FF9800',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          const db = wx.cloud.database();
          const targetOrder = this.data.allOrders.find(o => o._id === id);

          if (status === 'confirmed') {
            if (targetOrder && targetOrder.category === 'foster') {
              const [profileRes, activeRes] = await Promise.all([
                db.collection('agency_profiles').doc(this._agencyProfileId).get(),
                db.collection('user_orders').where({
                  orderType: 'agency',
                  category: 'foster',
                  agencyProfileId: this._agencyProfileId,
                  orderStatus: db.command.in(['confirmed', 'in_progress', 'to_confirm']),
                }).get(),
              ]);
              const total = Number((profileRes.data || {}).totalCages) || 0;
              const occupied = (activeRes.data || []).filter(o => !isLeaveExpired(o.leaveTimeMs)).length;
              if (total <= 0) {
                throw new Error('CAGE_NOT_CONFIGURED');
              }
              if (occupied >= total) {
                throw new Error('CAGE_FULL');
              }
            }
          }

          await db.collection('user_orders').doc(id).update({
            data: {
              orderStatus: status,
              updateTime: db.serverDate(),
            },
          });

          if (targetOrder && targetOrder.category === 'foster' && targetOrder.petId) {
            const nextPetStatus = this._mapFosterPetStatusByOrderStatus(status);
            try {
              // 校验宠物归属：宠物必须属于下单用户
              const petRes = await db.collection('pets').doc(targetOrder.petId).get();
              if (petRes.data && petRes.data.ownerId === targetOrder.ownerId) {
                await db.collection('pets').doc(targetOrder.petId).update({
                  data: {
                    petStatus: nextPetStatus,
                    updateTime: db.serverDate(),
                  },
                });
              } else {
                console.warn('[AgencyOrders] pet ownership mismatch, skip pet status update');
              }
            } catch (petErr) {
              console.warn('[AgencyOrders] sync foster pet status failed', petErr);
            }
          }

          wx.hideLoading();
          wx.showToast({ title: '操作成功', icon: 'success' });
          await this.loadOrders();
        } catch (e) {
          wx.hideLoading();
          console.error('[AgencyOrders] updateStatus', e);
          let msg = '操作失败';
          if (e && e.message === 'CAGE_NOT_CONFIGURED') msg = '请先在机构资料中填写笼位总数';
          if (e && e.message === 'CAGE_FULL') msg = '当前笼位不足，无法接单';
          wx.showToast({ title: msg, icon: 'none' });
        }
      },
    });
  },

  _buildLeaveRemainText(leaveTimeMs) {
    const ms = Number(leaveTimeMs) || 0;
    if (!ms) return '';
    const diff = ms - Date.now();
    if (diff <= 0) return '已离开（待释放笼位）';
    const totalHours = Math.ceil(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) return `还有${days}天${hours}小时离开`;
    return `还有${hours}小时离开`;
  },

  _isLeaveExpired(leaveTimeMs) {
    const ms = Number(leaveTimeMs) || 0;
    if (!ms) return false;
    return ms <= Date.now();
  },

  _mapFosterPetStatusByOrderStatus(orderStatus) {
    if (orderStatus === 'confirmed' || orderStatus === 'in_progress') return 'agency_foster';
    if (orderStatus === 'to_confirm') return 'waiting_pickup';
    if (orderStatus === 'cancelled' || orderStatus === 'completed') return '';
    return '';
  },

  _applyOccupiedFilter() {
    const all = this.data.occupiedPetsAll || [];
    const filter = this.data.petFilter || 'all';
    let list = all;
    if (filter === 'staying') list = all.filter(i => !i.isLeft);
    if (filter === 'left') list = all.filter(i => i.isLeft);
    this.setData({ occupiedPets: list });
  },

  _startLeaveTick() {
    this._stopLeaveTick();
    this._leaveTickTimer = setInterval(() => {
      const allOrders = this.data.allOrders || [];
      if (!allOrders.length) return;
      const refreshed = allOrders.map(item => ({
        ...item,
        leaveRemainText: buildLeaveRemainText(item.leaveTimeMs),
        isLeaveExpired: isLeaveExpired(item.leaveTimeMs),
      }));
      const occupiedFosterOrders = refreshed.filter(o => o.category === 'foster' && ['confirmed', 'in_progress', 'to_confirm'].includes(o.orderStatus));
      const occupiedPetsAll = occupiedFosterOrders.map(o => ({
        id: o._id,
        petName: o.petName || '未命名宠物',
        species: (o.petInfo && o.petInfo.species) || '',
        age: (o.petInfo && o.petInfo.age) || '',
        status: o.orderStatus,
        isLeft: !!o.isLeaveExpired,
        leaveRemainText: o.leaveRemainText || '未设置离开时间',
        image: (o.petInfo && o.petInfo.photo) || (o.images && o.images[0]) || '/static/pet/logo.png',
      }));
      const totalCages = Number((this.data.cageSummary && this.data.cageSummary.totalCages) || 0);
      const occupiedCages = occupiedFosterOrders.filter(o => !o.isLeaveExpired).length;
      const availableCages = Math.max(0, totalCages - occupiedCages);
      this.setData({
        allOrders: refreshed,
        pendingList: refreshed.filter(o => o.orderStatus === 'pending'),
        activeList: refreshed.filter(o => o.orderStatus === 'confirmed' || o.orderStatus === 'in_progress'),
        toConfirmList: refreshed.filter(o => o.orderStatus === 'to_confirm'),
        completedList: refreshed.filter(o => o.orderStatus === 'completed'),
        leftPetCount: occupiedPetsAll.filter(p => p.isLeft).length,
        occupiedPetsAll,
        cageSummary: {
          ...this.data.cageSummary,
          occupiedCages,
          availableCages,
        },
      });
      this._applyOccupiedFilter();
    }, 60000);
  },

  _stopLeaveTick() {
    if (this._leaveTickTimer) {
      clearInterval(this._leaveTickTimer);
      this._leaveTickTimer = null;
    }
  },

  // ===== 健康录入 =====
  openHealthRecord(e) {
    const { petid, petname } = e.currentTarget.dataset;
    this.setData({
      showHealthPopup: true,
      healthPetId: petid || '',
      healthPetName: petname || '宠物',
      healthType: 'weight',
      // 重置所有字段
      healthValue: '',
      healthNote: '',
      healthVaccineName: '',
      healthInstitution: '',
      healthNextDate: '',
      healthMedicineName: '',
      healthCheckupResult: '',
      healthFoodIntake: '',
      healthHistory: [],
      healthHistoryLoading: true,
    });
    this._loadHealthHistory(petid);
  },

  /** 加载该宠物的历史健康记录 */
  async _loadHealthHistory(petId) {
    if (!petId) {
      this.setData({ healthHistory: [], healthHistoryLoading: false });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection('health_records')
        .where({ pet_id: petId })
        .orderBy('record_date', 'desc')
        .limit(20)
        .get();
      const records = (res.data || []).map(r => ({
        type: r.type,
        typeLabel: this._healthTypeLabel(r.type),
        value: r.value || '',
        note: r.note || r.food_intake || '',
        dateStr: this._healthFormatDate(r.record_date),
        recorderRole: r.recorder_role || '',
      }));
      this.setData({ healthHistory: records, healthHistoryLoading: false });
    } catch (err) {
      console.warn('[AgencyOrders] load health history error', err);
      this.setData({ healthHistory: [], healthHistoryLoading: false });
    }
  },

  _healthTypeLabel(type) {
    const map = {
      weight: '体重',
      temperature: '体温',
      food: '饮食',
      vaccine: '疫苗',
      deworming: '驱虫',
      checkup: '体检',
      note: '备注',
    };
    return map[type] || type;
  },

  _healthFormatDate(t) {
    if (!t) return '';
    const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
    if (isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  },

  closeHealthRecord() {
    this.setData({ showHealthPopup: false });
  },

  onHealthTypeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.healthType) return;
    // 切换类型时清空相关字段
    this.setData({
      healthType: key,
      healthValue: '',
      healthNote: '',
      healthVaccineName: '',
      healthInstitution: '',
      healthNextDate: '',
      healthMedicineName: '',
      healthCheckupResult: '',
      healthFoodIntake: '',
    });
  },

  onHealthValueChange(e) { this.setData({ healthValue: e.detail.value || e.detail }); },
  onHealthVaccineNameChange(e) { this.setData({ healthVaccineName: e.detail.value }); },
  onHealthInstitutionChange(e) { this.setData({ healthInstitution: e.detail.value }); },
  onHealthNextDateChange(e) { this.setData({ healthNextDate: e.detail.value }); },
  onHealthMedicineNameChange(e) { this.setData({ healthMedicineName: e.detail.value }); },
  onHealthCheckupResultChange(e) { this.setData({ healthCheckupResult: e.detail.value }); },
  onHealthFoodIntakeChange(e) { this.setData({ healthFoodIntake: e.detail.value }); },
  onHealthNoteChange(e) { this.setData({ healthNote: e.detail.value || e.detail }); },

  async saveHealthRecord() {
    const {
      healthPetId, healthType, healthValue, healthNote,
      healthVaccineName, healthInstitution, healthNextDate,
      healthMedicineName, healthCheckupResult, healthFoodIntake,
    } = this.data;

    // 按类型的必填校验
    if (healthType === 'weight' && !healthValue) {
      return wx.showToast({ title: '请输入体重', icon: 'none' });
    }
    if (healthType === 'temperature' && !healthValue) {
      return wx.showToast({ title: '请输入体温', icon: 'none' });
    }
    if (healthType === 'vaccine' && !healthVaccineName) {
      return wx.showToast({ title: '请输入疫苗名称', icon: 'none' });
    }
    if (healthType === 'deworming' && !healthMedicineName) {
      return wx.showToast({ title: '请输入驱虫药名称', icon: 'none' });
    }
    if (healthType === 'food' && !healthFoodIntake) {
      return wx.showToast({ title: '请输入饮食情况', icon: 'none' });
    }
    if (healthType === 'note' && !healthNote) {
      return wx.showToast({ title: '请输入备注内容', icon: 'none' });
    }
    // 兜底：至少填一项
    if (!healthValue && !healthNote && !healthVaccineName && !healthMedicineName && !healthCheckupResult && !healthFoodIntake) {
      wx.showToast({ title: '请至少填写一项数据', icon: 'none' });
      return;
    }

    if (this.data.healthSaving) return;
    this.setData({ healthSaving: true });

    try {
      const db = wx.cloud.database();
      const recordData = {
        ownerId: this._agencyProfileId,
        pet_id: healthPetId,
        type: healthType,
        record_date: db.serverDate(),
        recorder_role: 'agency',
        note: healthNote || '',
      };

      // 按类型填充字段
      switch (healthType) {
        case 'weight':
          recordData.value = healthValue;
          break;
        case 'temperature':
          recordData.value = healthValue;
          break;
        case 'vaccine':
          recordData.value = healthVaccineName;
          recordData.vaccine_name = healthVaccineName;
          if (healthInstitution) recordData.institution = healthInstitution;
          if (healthNextDate) recordData.next_date = new Date(healthNextDate);
          break;
        case 'deworming':
          recordData.value = healthMedicineName;
          recordData.medicine_name = healthMedicineName;
          if (healthNextDate) recordData.next_date = new Date(healthNextDate);
          break;
        case 'checkup':
          if (healthCheckupResult) recordData.result = healthCheckupResult;
          if (healthInstitution) recordData.institution = healthInstitution;
          break;
        case 'food':
          recordData.value = healthFoodIntake;
          recordData.food_intake = healthFoodIntake;
          break;
        case 'note':
          recordData.value = healthNote;
          break;
      }

      await db.collection('health_records').add({ data: recordData });
      wx.showToast({ title: '录入成功' });
      this.setData({ showHealthPopup: false, healthSaving: false });
    } catch (err) {
      this.setData({ healthSaving: false });
      wx.showToast({ title: '录入失败', icon: 'none' });
    }
  },
});
