// pages/agency-pets/agency-pets.js
const authService = require('../../services/authService');

Page({
  data: {
    loading: true,
    totalCages: 0,
    occupiedCages: 0,
    availableCages: 0,
    cages: [],
    filteredCages: [],
    activeFilter: 'all',
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

  /** 点击笼位卡片：占用笼位跳转到订单管理 */
  onCageTap(e) {
    const order = e.currentTarget.dataset.order;
    if (order) {
      wx.navigateTo({ url: '/pages/agency-orders/agency-orders' });
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
      const [profileRes, ordersRes] = await Promise.all([
        db.collection('agency_profiles').doc(this._agencyProfileId).get(),
        db.collection('user_orders')
          .where({
            orderType: 'agency',
            agencyProfileId: this._agencyProfileId,
            category: 'foster',
            orderStatus: db.command.in(['confirmed', 'in_progress', 'to_confirm']),
          })
          .limit(100)
          .get(),
      ]);

      const profile = profileRes.data || {};
      const totalCages = Number(profile.totalCages) || 0;

      // 过滤已离开的订单
      const activeOrders = (ordersRes.data || []).filter(o => !this._isLeaveExpired(o.leaveTimeMs));

      // ---- 笼位分配逻辑 ----
      // 1. 对已有 cageNumber 的订单，按 cageNumber 映射
      // 2. 对没有 cageNumber 的订单，自动分配到空闲笼位
      const usedNumbers = new Set();
      const assignedOrders = [];

      activeOrders.forEach(o => {
        if (o.cageNumber && o.cageNumber >= 1 && o.cageNumber <= totalCages) {
          if (!usedNumbers.has(o.cageNumber)) {
            usedNumbers.add(o.cageNumber);
            assignedOrders.push(o);
          }
          // 如果 cageNumber 冲突（两个订单同一号码），忽略后者的号码
        }
      });

      // 未分配的订单（无 cageNumber 或号码冲突/无效）
      const unassigned = activeOrders.filter(o => {
        if (!o.cageNumber || o.cageNumber < 1 || o.cageNumber > totalCages) return true;
        // 检查是否已被前面的 assignedOrders 包含
        return !assignedOrders.find(a => a._id === o._id);
      });

      // 找出空闲笼位号
      const availableNumbers = [];
      for (let n = 1; n <= totalCages; n++) {
        if (!usedNumbers.has(n)) availableNumbers.push(n);
      }

      // 为未分配订单自动分配笼位，并回写数据库
      const backfillBatch = [];
      unassigned.forEach((o, idx) => {
        if (idx < availableNumbers.length) {
          const cn = availableNumbers[idx];
          o.cageNumber = cn;
          usedNumbers.add(cn);
          backfillBatch.push({ id: o._id, cageNumber: cn });
          assignedOrders.push(o);
        }
      });

      // 异步回写 cageNumber（不阻塞渲染）
      if (backfillBatch.length > 0) {
        backfillBatch.forEach(item => {
          db.collection('user_orders').doc(item.id).update({
            data: { cageNumber: item.cageNumber },
          }).catch(err => console.warn('[AgencyPets] backfill cageNumber failed', err));
        });
      }

      // 按 cageNumber 升序排列
      assignedOrders.sort((a, b) => a.cageNumber - b.cageNumber);

      // 构建笼位数组
      const cages = [];
      let occupiedCount = 0;
      const orderMap = {};
      assignedOrders.forEach(o => { orderMap[o.cageNumber] = o; });

      for (let i = 1; i <= totalCages; i++) {
        const order = orderMap[i];
        if (order) {
          occupiedCount++;
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
                photo: (order.petInfo && order.petInfo.photo) || '',
              },
            },
          });
        } else {
          cages.push({
            cageNumber: i,
            occupied: false,
            order: null,
          });
        }
      }

      this.setData({
        totalCages,
        occupiedCages: occupiedCount,
        availableCages: Math.max(0, totalCages - occupiedCount),
        cages,
        loading: false,
      });
      this._applyFilter();

    } catch (err) {
      console.error('[AgencyPets] loadCageData error', err);
      this.setData({
        totalCages: 0,
        occupiedCages: 0,
        availableCages: 0,
        cages: [],
        filteredCages: [],
        loading: false,
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
      const db = wx.cloud.database();
      await db.collection('user_orders').doc(orderId).update({
        data: { cageNumber: toCage },
      });

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
