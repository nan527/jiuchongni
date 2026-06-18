// pages/agency-pets/agency-pets.js
const authService = require('../../services/authService');
const { resolveTempUrls } = require('../../utils/fileHelper');

Page({
  data: {
    loading: true,
    totalCages: 0,
    occupiedCages: 0,
    availableCages: 0,
    cages: [],
    filteredCages: [],
    activeFilter: 'all',
    activeOrders: [],
    // 移动弹窗
    showMovePopup: false,
    moveFromCage: 0,
    moveTargetList: [],
    moveOrderId: '',
    movePetName: '',
  },

  _agencyProfileId: '',
  _leaveTickTimer: null,

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._agencyProfileId = userInfo.agencyProfileId || '';
    if (!this._agencyProfileId) {
      this.setData({ loading: false });
      wx.showToast({ title: '未找到机构信息', icon: 'none' });
      return;
    }

    this._startLeaveTick();
    this.loadCageData();
  },

  onHide() {
    this._stopLeaveTick();
  },

  onUnload() {
    this._stopLeaveTick();
  },

  /** 切换筛选条件 */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter || filter === this.data.activeFilter) return;
    this.setData({ activeFilter: filter }, () => this._applyFilter());
  },

  /** 点击宠物列表项：跳转到宠物档案 */
  onPetTap(e) {
    const petId = e.currentTarget.dataset.petid;
    if (petId) {
      wx.navigateTo({ url: '/pages/agency-pet-detail/agency-pet-detail?petId=' + petId });
    }
  },

  /** 点击笼位卡片：占用笼位跳转到宠物档案 */
  onCageTap(e) {
    const order = e.currentTarget.dataset.order;
    if (order && order.petId) {
      wx.navigateTo({ url: '/pages/agency-pet-detail/agency-pet-detail?petId=' + order.petId });
    }
  },

  /** 跳转到机构资料编辑 */
  toEditAgency() {
    wx.navigateTo({ url: '/pages/agency-edit/agency-edit' });
  },

  /** 加载笼位数据 */
  async loadCageData() {
    this.setData({ loading: true });
    const db = wx.cloud.database();

    try {
      console.log('[AgencyPets] agencyProfileId:', this._agencyProfileId);
      // 直接查订单，不依赖 profile 读取
      const ordersRes = await db.collection('user_orders')
        .where({
          orderType: 'agency',
          agencyProfileId: this._agencyProfileId,
          category: 'foster',
          orderStatus: db.command.in(['confirmed', 'in_progress', 'to_confirm']),
        })
        .limit(100)
        .get();
      console.log('[AgencyPets] 查到订单:', ordersRes.data.length, '条');

      // 过滤已离开的订单
      const activeOrders = (ordersRes.data || []).filter(o => !this._isLeaveExpired(o.leaveTimeMs));

      // 批量解析宠物头像中的 cloud:// 文件 ID
      const cloudPhotoMap = {};
      const cloudPhotoIDs = [];
      activeOrders.forEach(o => {
        const photo = o.petInfo && o.petInfo.photo;
        if (photo && photo.startsWith('cloud://') && !cloudPhotoMap[photo]) {
          cloudPhotoMap[photo] = '';
          cloudPhotoIDs.push(photo);
        }
      });
      if (cloudPhotoIDs.length > 0) {
        try {
          const resolved = await resolveTempUrls(cloudPhotoIDs);
          cloudPhotoIDs.forEach((id, i) => { cloudPhotoMap[id] = resolved[i] || ''; });
        } catch (e) {
          console.warn('[AgencyPets] resolveTempUrls error', e);
        }
      }

      // 尝试读 profile 获取笼位总数，失败就用订单数
      let totalCages = 0;
      try {
        const profileRes = await db.collection('agency_profiles').doc(this._agencyProfileId).get();
        totalCages = Number((profileRes.data || {}).totalCages) || 0;
      } catch (e) {
        // 读不到就用订单数
      }
      if (totalCages === 0 && activeOrders.length > 0) {
        totalCages = activeOrders.length;
      }

      // 构建笼位数组
      console.log('[AgencyPets] totalCages:', totalCages, 'activeOrders:', activeOrders.length);
      const cages = [];
      let occupiedCount = 0;

      if (totalCages > 0) {
        // 对已有 cageNumber 的订单按号码映射
        const usedNumbers = new Set();
        const orderMap = {};

        activeOrders.forEach(o => {
          if (o.cageNumber && o.cageNumber >= 1 && o.cageNumber <= totalCages && !usedNumbers.has(o.cageNumber)) {
            usedNumbers.add(o.cageNumber);
            orderMap[o.cageNumber] = o;
          }
        });

        // 未分配的订单自动分配空闲笼位
        const unassigned = activeOrders.filter(o => !o.cageNumber || o.cageNumber < 1 || o.cageNumber > totalCages || !orderMap[o.cageNumber]);
        const available = [];
        for (let n = 1; n <= totalCages; n++) {
          if (!usedNumbers.has(n)) available.push(n);
        }
        unassigned.forEach((o, idx) => {
          if (idx < available.length) {
            o.cageNumber = available[idx];
            usedNumbers.add(o.cageNumber);
            orderMap[o.cageNumber] = o;
            wx.cloud.callFunction({
              name: 'ai_handler',
              data: {
                action: 'update_order_cage',
                orderId: o._id,
                cageNumber: o.cageNumber,
                agencyProfileId: this._agencyProfileId,
              },
            }).catch(() => {});
          }
        });

        // 构建笼位网格
        for (let i = 1; i <= totalCages; i++) {
          const order = orderMap[i];
          if (order) {
            occupiedCount++;
            const rawPhoto = (order.petInfo && order.petInfo.photo) || '';
            cages.push({
              cageNumber: i,
              occupied: true,
              order: {
                _id: order._id,
                petName: order.petName || '未命名宠物',
                petId: order.petId,
                checkinDate: order.checkinDate || '',
                leaveTimeMs: order.leaveTimeMs,
                petInfo: {
                  species: (order.petInfo && order.petInfo.species) || '',
                  age: (order.petInfo && order.petInfo.age) || '',
                  photo: cloudPhotoMap[rawPhoto] !== undefined ? cloudPhotoMap[rawPhoto] : rawPhoto,
                },
              },
            });
          } else {
            cages.push({ cageNumber: i, occupied: false, order: null });
          }
        }
      }

      const orderData = activeOrders.map(o => {
        const rawPhoto = (o.petInfo && o.petInfo.photo) || '';
        return {
          _id: o._id,
          petId: o.petId,
          petName: o.petName || '未命名宠物',
          petInfo: {
            species: (o.petInfo && o.petInfo.species) || '',
            age: (o.petInfo && o.petInfo.age) || '',
            photo: cloudPhotoMap[rawPhoto] !== undefined ? cloudPhotoMap[rawPhoto] : rawPhoto,
          },
          checkinDate: o.checkinDate || '',
          cageNumber: o.cageNumber,
          orderStatus: o.orderStatus,
          serviceName: o.serviceName || '',
          leaveTimeMs: o.leaveTimeMs,
        };
      });

      this.setData({
        loading: false,
        totalCages,
        occupiedCages: occupiedCount,
        availableCages: Math.max(0, totalCages - occupiedCount),
        cages,
        filteredCages: cages,
        activeOrders: orderData,
      });

    } catch (err) {
      console.error('[AgencyPets] loadCageData error', err);
      this.setData({
        loading: false,
        totalCages: 0,
        cages: [],
        filteredCages: [],
        activeOrders: [],
      });
    }
  },

  /** 按筛选条件过滤笼位 */
  _applyFilter() {
    const { cages, activeFilter } = this.data;
    let filtered = cages;
    if (activeFilter === 'occupied') {
      filtered = cages.filter(c => c.occupied);
    } else if (activeFilter === 'available') {
      filtered = cages.filter(c => !c.occupied);
    }
    this.setData({ filteredCages: filtered });
  },

  // ====== 移动笼位 ======

  /** 点击移动按钮：弹出可用笼位列表 */
  onMoveTap(e) {
    const { id, cage } = e.currentTarget.dataset;
    const order = e.currentTarget.dataset.order;
    const cages = this.data.cages;

    // 找出可用笼位（空闲的）
    const targets = cages
      .filter(c => !c.occupied && c.cageNumber !== Number(cage))
      .map(c => c.cageNumber);

    if (targets.length === 0) {
      wx.showToast({ title: '没有空闲笼位可移动', icon: 'none' });
      return;
    }

    this.setData({
      showMovePopup: true,
      moveFromCage: Number(cage),
      moveOrderId: id,
      movePetName: (order && order.petName) || '宠物',
      moveTargetList: targets,
    });
  },

  /** 关闭移动弹窗 */
  closeMovePopup() {
    this.setData({
      showMovePopup: false,
      moveFromCage: 0,
      moveTargetList: [],
      moveOrderId: '',
      movePetName: '',
    });
  },

  /** 选择目标笼位 */
  onMoveTargetTap(e) {
    const toCage = Number(e.currentTarget.dataset.cage);
    const orderId = this.data.moveOrderId;
    const fromCage = this.data.moveFromCage;
    const petName = this.data.movePetName;

    if (!orderId || !toCage) return;

    wx.showModal({
      title: '确认移动',
      content: `将「${petName}」从 ${fromCage} 号笼移动到 ${toCage} 号笼？`,
      success: async (res) => {
        if (!res.confirm) return;
        await this._doMove(orderId, toCage);
      },
    });
  },

  /** 执行移动操作 */
  async _doMove(orderId, toCage) {
    wx.showLoading({ title: '移动中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'update_order_cage',
          orderId: orderId,
          cageNumber: toCage,
          agencyProfileId: this._agencyProfileId,
        },
      });

      const { success, msg } = result.result || {};
      if (!success) {
        throw new Error(msg || '移动失败');
      }

      wx.hideLoading();
      wx.showToast({ title: '移动成功', icon: 'success' });
      this.closeMovePopup();
      this.loadCageData();
    } catch (err) {
      wx.hideLoading();
      console.error('[AgencyPets] move cage error', err);
      wx.showToast({ title: '移动失败', icon: 'none' });
    }
  },

  // ====== 倒计时 ======

  _startLeaveTick() {
    this._stopLeaveTick();
    this._leaveTickTimer = setInterval(() => {
      this.loadCageData();
    }, 60000);
  },

  _stopLeaveTick() {
    if (this._leaveTickTimer) {
      clearInterval(this._leaveTickTimer);
      this._leaveTickTimer = null;
    }
  },

  // ====== 工具方法 ======

  _isLeaveExpired(leaveTimeMs) {
    const ms = Number(leaveTimeMs) || 0;
    if (!ms) return false;
    return ms <= Date.now();
  },
});
