// pages/foster-detail/foster-detail.js
const authService = require('../../services/authService');

Page({
  data: {
    detail: null,
    isOwner: false,
    applying: false,
    applicationCount: 0,
    // 申请表单
    showApplyForm: false,
    applyMessage: '',
    applyContactName: '',
    applyContactPhone: '',
    applyExperience: '',
    // 编辑相关
    editing: false,
    saving: false,
    editDesc: '',
    editBudget: '',
    editReason: '',
    editRequirement: '',
    editContactName: '',
    editContactPhone: '',
    editLocation: '',
  },

  _id: '',
  _type: '',

  async onLoad(options) {
    const { id, type } = options;
    if (!id || !type) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this._id = id;
    this._type = type;
    await this._loadDetail();
  },

  async _loadDetail() {
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const collection = this._type === 'foster' ? 'fosters' : 'adoptions';
      const res = await db.collection(collection).doc(this._id).get();
      const detail = { ...res.data, _type: this._type };

      const userInfo = await authService.checkLogin();
      const isOwner = userInfo && detail.ownerId === userInfo._id;

      wx.setNavigationBarTitle({ title: this._type === 'foster' ? '寄养详情' : '送养详情' });
      this.setData({ detail, isOwner });

      // 加载待审核申请数量
      if (isOwner && detail.status === 'open') {
        this._loadApplicationCount();
      }
    } catch (e) {
      console.error('[FosterDetail] load', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  previewImg(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      current: src,
      urls: this.data.detail.images || [src],
    });
  },

  // ===== 编辑相关 =====
  startEdit() {
    const d = this.data.detail;
    this.setData({
      editing: true,
      editDesc: d.description || '',
      editBudget: d.budget || '',
      editReason: d.reason || '',
      editRequirement: d.requirement || '',
      editContactName: d.contactName || '',
      editContactPhone: d.contactPhone || '',
      editLocation: d.location || '',
    });
    wx.pageScrollTo({ selector: '.edit-btn-row', duration: 300 });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onEditDescChange(e) { this.setData({ editDesc: e.detail }); },
  onEditBudgetChange(e) { this.setData({ editBudget: e.detail }); },
  onEditReasonChange(e) { this.setData({ editReason: e.detail }); },
  onEditRequirementChange(e) { this.setData({ editRequirement: e.detail }); },
  onEditContactNameChange(e) { this.setData({ editContactName: e.detail }); },
  onEditContactPhoneChange(e) { this.setData({ editContactPhone: e.detail }); },
  onEditLocationChange(e) { this.setData({ editLocation: e.detail }); },

  async saveEdit() {
    if (this.data.saving) return;
    // 所有权校验
    if (!this.data.isOwner) {
      wx.showToast({ title: '无权修改该信息', icon: 'none' });
      return;
    }
    this.setData({ saving: true });

    try {
      const db = wx.cloud.database();
      const d = this.data.detail;
      const collection = d._type === 'foster' ? 'fosters' : 'adoptions';
      const updateData = {
        contactName: this.data.editContactName,
        contactPhone: this.data.editContactPhone,
        location: this.data.editLocation,
      };
      if (d._type === 'foster') {
        updateData.description = this.data.editDesc;
        updateData.budget = this.data.editBudget;
      } else {
        updateData.reason = this.data.editReason;
        updateData.requirement = this.data.editRequirement;
      }

      await db.collection(collection).doc(d._id).update({ data: updateData });
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.setData({ editing: false });
      await this._loadDetail();
    } catch (e) {
      console.error('[FosterDetail] saveEdit', e);
      wx.showToast({ title: '修改失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ===== 关闭 / 重新开放 =====
  toggleStatus() {
    // 所有权校验
    if (!this.data.isOwner) {
      wx.showToast({ title: '无权操作该信息', icon: 'none' });
      return;
    }
    const d = this.data.detail;
    const newStatus = d.status === 'open' ? 'closed' : 'open';
    const label = newStatus === 'closed' ? '关闭' : '重新开放';

    wx.showModal({
      title: `确认${label}`,
      content: `${label}后，其他用户将${newStatus === 'closed' ? '无法' : '可以'}看到并申请该信息。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          const collection = d._type === 'foster' ? 'fosters' : 'adoptions';
          await db.collection(collection).doc(d._id).update({ data: { status: newStatus } });

          // 同步宠物档案状态
          if (d.petId) {
            const petStatus = newStatus === 'closed' ? ''
              : (d._type === 'foster' ? 'pending_foster' : 'pending_adopt');
            try {
              await db.collection('pets').doc(d.petId).update({ data: { petStatus } });
            } catch (e) { /* ignore */ }
          }

          wx.showToast({ title: `已${label}`, icon: 'success' });
          await this._loadDetail();
        } catch (e) {
          console.error('[FosterDetail] toggleStatus', e);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  // ===== 删除 =====
  deletePost() {
    // 所有权校验
    if (!this.data.isOwner) {
      wx.showToast({ title: '无权删除该信息', icon: 'none' });
      return;
    }
    const d = this.data.detail;
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${d.petName}」的${d._type === 'foster' ? '寄养' : '送养'}信息？删除后不可恢复。`,
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          const db = wx.cloud.database();
          const collection = d._type === 'foster' ? 'fosters' : 'adoptions';
          await db.collection(collection).doc(d._id).remove();

          // 重置宠物档案状态
          if (d.petId) {
            try {
              await db.collection('pets').doc(d.petId).update({ data: { petStatus: '' } });
            } catch (e) { /* ignore */ }
          }

          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (e) {
          wx.hideLoading();
          console.error('[FosterDetail] delete', e);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ===== 申请数量 =====
  async _loadApplicationCount() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('foster_applications')
        .where({ postId: this._id, applyStatus: 'pending' })
        .count();
      this.setData({ applicationCount: res.total || 0 });
    } catch (e) {
      console.warn('[FosterDetail] loadApplicationCount', e);
    }
  },

  viewApplications() {
    wx.navigateTo({
      url: `/pages/adoption-review/adoption-review?id=${this._id}&type=${this._type}`,
    });
  },

  // ===== 申请表单 =====
  onApply() {
    authService.checkLogin().then(userInfo => {
      if (!userInfo) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      this._applyUser = userInfo;
      this.setData({
        showApplyForm: true,
        applyMessage: '',
        applyContactName: userInfo.nickname || '',
        applyContactPhone: '',
        applyExperience: '',
      });
    });
  },

  closeApplyForm() { this.setData({ showApplyForm: false }); },
  onApplyMessageChange(e) { this.setData({ applyMessage: e.detail }); },
  onApplyContactNameChange(e) { this.setData({ applyContactName: e.detail }); },
  onApplyContactPhoneChange(e) { this.setData({ applyContactPhone: e.detail }); },
  onApplyExperienceChange(e) { this.setData({ applyExperience: e.detail }); },

  async submitApply() {
    if (!this.data.applyMessage.trim()) {
      return wx.showToast({ title: '请填写申请说明', icon: 'none' });
    }
    if (!this.data.applyContactName.trim()) {
      return wx.showToast({ title: '请填写联系人', icon: 'none' });
    }
    if (this.data.applying) return;
    this.setData({ applying: true });

    try {
      const db = wx.cloud.database();
      const d = this.data.detail;
      const userInfo = this._applyUser;

      await db.collection('foster_applications').add({
        data: {
          ownerId: userInfo._id,
          postId: d._id,
          postType: d._type,
          applyType: d._type,
          petName: d.petName,
          breed: d.breed || '',
          images: d.images || [],
          authorName: d.authorName || d.contactName || '',
          authorOpenid: d._openid,
          applyMessage: this.data.applyMessage.trim(),
          applicantName: this.data.applyContactName.trim(),
          applicantPhone: this.data.applyContactPhone.trim(),
          applicantExperience: this.data.applyExperience.trim(),
          applicantNickname: userInfo.nickname || '',
          applicantAvatar: userInfo.avatar || '',
          applyStatus: 'pending',
          applyTime: db.serverDate(),
        },
      });

      await db.collection('user_orders').add({
        data: {
          ownerId: userInfo._id,
          orderType: 'personal',
          sourceType: d._type,
          postId: d._id,
          petName: d.petName,
          breed: d.breed || '',
          images: d.images || [],
          counterpart: d.authorName || d.contactName || '匿名',
          orderStatus: 'pending',
          createTime: db.serverDate(),
        },
      });

      this.setData({ showApplyForm: false });
      wx.showToast({ title: '申请已提交', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (e) {
      console.error('[FosterDetail] submitApply', e);
      wx.showToast({ title: '申请失败', icon: 'none' });
    } finally {
      this.setData({ applying: false });
    }
  },
});
