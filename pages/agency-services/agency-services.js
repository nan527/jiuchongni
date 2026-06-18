// pages/agency-services/agency-services.js
const authService = require('../../services/authService');
const { getStatusBarHeight } = require('../../utils/helpers');

const CATEGORY_META = [
  { key: 'foster',   title: '宠物寄养',     icon: 'home-o' },
  { key: 'grooming', title: '美容洗护',     icon: 'diamond-o' },
  { key: 'medical',  title: '医疗健康',     icon: 'medal-o' },
  { key: 'door',     title: '上门服务',     icon: 'logistics' },
];

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    services: [],
    groupedServices: [],
    loading: true,
    profileId: '',
  },

  onGoBack() {
    wx.navigateBack();
  },

  async onShow() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    await this.loadServices();
  },

  async loadServices() {
    this.setData({ loading: true });
    try {
      const userInfo = await authService.checkLogin();
      if (!userInfo || !userInfo.agencyProfileId) {
        this.setData({ loading: false });
        return;
      }
      this.setData({ profileId: userInfo.agencyProfileId });

      const db = wx.cloud.database();
      let services = [];
      try {
        const res = await db.collection('agency_services').where({ agencyProfileId: userInfo.agencyProfileId }).get();
        services = res.data || [];
      } catch (e) {
        console.warn('[AgencyServices] 集合可能不存在', e.errCode || e.message);
      }

      // 按分类分组
      const grouped = CATEGORY_META.map(cat => ({
        key: cat.key,
        title: cat.title,
        icon: cat.icon,
        list: services.filter(s => s.category === cat.key),
      }));

      this.setData({ services, groupedServices: grouped, loading: false });
    } catch (err) {
      console.error('[AgencyServices] 加载失败', err);
      this.setData({ loading: false });
    }
  },

  toAddService() {
    wx.navigateTo({ url: '/pages/agency-services-add/agency-services-add?profileId=' + this.data.profileId });
  },

  onEditService(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/agency-services-add/agency-services-add?editId=' + id + '&profileId=' + this.data.profileId });
  },

  onDeleteService(e) {
    const id = e.currentTarget.dataset.id;
    const svc = this.data.services.find(s => s._id === id);
    wx.showModal({
      title: '删除服务',
      content: `确定删除「${svc ? svc.name : '该服务'}」？删除后不可恢复。`,
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const db = wx.cloud.database();
          await db.collection('agency_services').doc(id).remove();
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadServices();
        } catch (err) {
          console.error('[AgencyServices] 删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
