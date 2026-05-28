// pages/login/login.js
const authService = require('../../services/authService');
const { ROLES, ROLE_INFO } = require('../../constants/index');

Page({
  data: {
    role: ROLES.PET_OWNER,
    logging: false,
    isCheck: false,
    roles: [
      { value: ROLES.PET_OWNER, label: ROLE_INFO[ROLES.PET_OWNER].label, desc: ROLE_INFO[ROLES.PET_OWNER].desc, icon: ROLE_INFO[ROLES.PET_OWNER].icon },
      { value: ROLES.AGENCY, label: ROLE_INFO[ROLES.AGENCY].label, desc: ROLE_INFO[ROLES.AGENCY].desc, icon: ROLE_INFO[ROLES.AGENCY].icon },
    ],
    // 管理员登录
    showAdmin: false,
    adminAccount: '',
    adminPassword: '',
    adminLogging: false,
  },

  onShow() {
    this.setData({ logging: false });
  },

  onRoleChange(e) {
    this.setData({ role: e.detail });
  },

  onRoleClick(e) {
    const role = e.currentTarget.dataset.name;
    if (role) this.setData({ role });
  },

  onCheckChange(e) {
    this.setData({ isCheck: e.detail });
  },

  viewAgreement() {
    wx.showModal({
      title: '服务协议',
      content: '本平台致力于为宠物主人和寄养机构提供安全、可靠的宠物寄养匹配与健康管理服务。使用本平台即表示您同意遵守相关规定。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  /** 微信一键登录 */
  async login() {
    if (!this.data.isCheck) {
      return wx.showToast({ title: '请先勾选服务协议', icon: 'none' });
    }
    if (this.data.logging) return;
    this.setData({ logging: true });

    try {
      const userInfo = await authService.loginWithWechat(this.data.role);
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        authService.navigateByRole(userInfo.role);
      }, 800);
    } catch (err) {
      console.error('[Login] 登录异常', err);
      const code = err.message;
      let content = '请检查网络连接或云环境配置';
      if (code === 'CLOUD_FETCH_FAILED') content = '云开发连接失败，请确认开发者工具已登录、云环境可用，并关闭代理后重试';
      wx.showModal({ title: '登录失败', content, showCancel: false });
    } finally {
      this.setData({ logging: false });
    }
  },

  /** 管理员弹窗 */
  showAdminLogin() {
    this.setData({ showAdmin: true, adminAccount: '', adminPassword: '' });
  },

  closeAdminLogin() {
    this.setData({ showAdmin: false });
  },

  onAdminAccountChange(e) {
    this.setData({ adminAccount: e.detail.value });
  },

  onAdminPasswordChange(e) {
    this.setData({ adminPassword: e.detail.value });
  },

  async adminLogin() {
    const { adminAccount, adminPassword } = this.data;
    if (!adminAccount.trim() || !adminPassword.trim()) {
      return wx.showToast({ title: '请输入账号和密码', icon: 'none' });
    }
    if (this.data.adminLogging) return;
    this.setData({ adminLogging: true });

    try {
      const userInfo = await authService.loginWithAccount('admin', adminAccount, adminPassword);
      this.setData({ showAdmin: false });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        authService.navigateByRole(userInfo.role);
      }, 800);
    } catch (err) {
      const code = err.message;
      let msg = '登录失败';
      if (code === 'ACCOUNT_OR_PASSWORD_INCORRECT') msg = '账号或密码错误';
      if (code === 'EMPTY_ACCOUNT_OR_PASSWORD') msg = '请输入账号和密码';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ adminLogging: false });
    }
  },
});
