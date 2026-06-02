// app.js
const authService = require('./services/authService');

App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-9gkyi3gf77e7048e',
        traceUser: true,
      });
    }

    /**
     * 【就宠你 4人团队高内聚、低耦合分工 3.0】
     * 1. 同学 A (Auth Service): 负责身份、权限、分流、users 集合。
     * 2. 同学 B (Pet Service): 负责宠物/机构档案、匹配算法、pets/agencies 集合。
     * 3. 同学 C (Trade Service): 负责订单状态、实时打卡、互动评分、orders 集合。
     * 4. 同学 D (AI Service): 负责健康看板、AI创作、智能解读、records 集合。
     */
    this.globalData = {
      // 模块解耦：各成员通过以下独立节点同步关键状态
      auth: { userInfo: null },
      pet: { currentPet: null },
      trade: { activeOrder: null },
      ai: { lastReport: null },
    };

    // 启动时静默检查登录状态，将缓存恢复到 globalData
    this.silentLogin();
  },

  /** 静默登录：优先读取本地缓存，失败则不阻塞启动 */
  async silentLogin() {
    try {
      const userInfo = await authService.checkLogin();
      if (userInfo) {
        this.globalData.auth.userInfo = userInfo;
        // 根据角色跳转到对应首页（仅启动时跳转）
        const role = userInfo.role;
        if (role === 'agency') {
          wx.reLaunch({ url: '/pages/agency/agency' });
        } else if (role === 'admin') {
          wx.reLaunch({ url: '/pages/admin/admin' });
        }
        // pet_owner 留在默认首页，无需跳转
      }
    } catch (err) {
      console.warn('[App] 静默登录异常', err);
    }
  },
});
