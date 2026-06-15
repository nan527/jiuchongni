// pages/login/login.js
const authService = require('../../services/authService');
const { ROLES, ROLE_INFO } = require('../../constants/index');
const { getStatusBarHeight } = require('../../utils/helpers');

Page({
  data: {
    role: ROLES.PET_OWNER,
    logging: false,
    isCheck: false,
    statusBarHeight: 0,
    navBarHeight: 0,
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

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
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
      content: '【就宠你】宠物智能服务平台服务协议\n\n一、总则\n1.1 本协议是您与"就宠你"平台（以下简称"本平台"）之间关于使用本平台服务的法律协议。\n1.2 您在使用本平台服务前，请务必仔细阅读并充分理解本协议内容。一旦您注册、登录或使用本平台服务，即表示您已同意接受本协议的全部条款。\n\n二、服务内容\n2.1 本平台为宠物主人和寄养机构提供宠物寄养匹配、健康管理、AI智能推荐等服务。\n2.2 本平台有权根据业务发展需要，随时调整、增加或减少服务内容。\n\n三、用户义务\n3.1 用户应提供真实、准确、完整的个人信息。\n3.2 用户不得利用本平台从事违法违规活动。\n3.3 用户应妥善保管账号密码，因用户自身原因导致的账号安全问题由用户自行承担。\n\n四、隐私保护\n4.1 本平台将严格按照相关法律法规保护用户个人信息。\n4.2 未经用户同意，本平台不会向第三方披露用户个人信息，法律法规另有规定的除外。\n\n五、免责声明\n5.1 本平台仅提供信息撮合服务，不对寄养机构的具体服务质量承担保证责任。\n5.2 因不可抗力导致服务中断的，本平台不承担责任。\n\n六、协议修改\n6.1 本平台有权根据需要修改本协议，修改后的协议将在平台公示。\n6.2 用户继续使用本平台服务即视为同意修改后的协议。\n\n七、争议解决\n7.1 因本协议引起的争议，双方应友好协商解决。\n7.2 协商不成的，任何一方可向本平台所在地人民法院提起诉讼。',
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
      if (!userInfo) return;
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

  onGoBack() {
    wx.navigateBack({ delta: 1 });
  },
});
