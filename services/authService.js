/**
 * AuthService —— 认证服务
 * 负责登录、注册、会话缓存、角色路由等统一逻辑
 * 其他页面通过 const authService = require('../../services/authService') 引入
 */
const { ROLES, ROLE_INFO, STORAGE_KEYS, SESSION_EXPIRE_MS } = require('../constants/index');

/** 惰性获取 db 实例，避免在 wx.cloud.init() 之前调用 */
let _db = null;
function getDB() {
  if (!_db) _db = wx.cloud.database();
  return _db;
}

/** 带超时的 Promise 包装，避免云调用卡死 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function isTimeoutError(err) {
  const msg = (err && err.message) || '';
  return msg === 'timeout';
}

function isCloudFetchError(err) {
  const msg = ((err && err.message) || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('request:fail') || msg.includes('network error');
}

const authService = {
  // ======================== 公开方法 ========================

  /**
   * 检查登录状态（优先本地缓存 → 云端静默查询）
   * @returns {Object|null} userInfo 或 null
   */
  async checkLogin() {
    try {
      // 0. 已主动登出，不再静默恢复
      if (wx.getStorageSync('jcn_logged_out')) {
        return null;
      }
      // 1. 本地缓存
      const cached = this._getCachedUser();
      if (cached) {
        await this._ensureOpenid(cached);
        // 机构用户需验证审核状态是否变化（管理员审核后缓存会过期）
        if (cached.role === ROLES.AGENCY && cached._id) {
          try {
            const fresh = await withTimeout(
              getDB().collection('users').doc(cached._id).get(),
              10000
            );
            if (fresh.data && fresh.data.auditStatus !== cached.auditStatus) {
              cached.auditStatus = fresh.data.auditStatus;
              this._cacheUser(cached);
            }
            if (fresh.data && fresh.data.agencyProfileId !== cached.agencyProfileId) {
              cached.agencyProfileId = fresh.data.agencyProfileId;
              this._cacheUser(cached);
            }
          } catch (e) {
            console.warn('[Auth] 审核状态查询失败，使用缓存值', e);
          }
        }
        this._syncToGlobal(cached);
        return cached;
      }

      // 2. 云端静默查询（5 秒超时，不阻塞体验）
      try {
        const res = await withTimeout(
          getDB().collection('users').where({ _openid: '{openid}' }).orderBy('createTime', 'desc').limit(1).get(),
          5000
        );
        if (res.data.length > 0) {
          const userInfo = res.data[0];
          await this._ensureOpenid(userInfo);
          this._cacheUser(userInfo);
          return userInfo;
        }
      } catch (err) {
        console.warn('[AuthService] 静默查询失败或超时', err.message || err);
      }

      return null;
    } catch (err) {
      console.warn('[AuthService] checkLogin异常，按未登录处理', err.message || err);
      return null;
    }
  },

  /**
   * 账号密码登录（宠主 / 机构 / 管理员）
   * @param {string} role - 角色：pet_owner / agency / admin
   * @param {string} account
   * @param {string} password
   */
  async loginWithAccount(role, account, password) {
    const acc = (account || '').trim();
    const pwd = (password || '').trim();
    if (!acc || !pwd) {
      throw new Error('EMPTY_ACCOUNT_OR_PASSWORD');
    }

    if (role === ROLES.ADMIN) {
      await this.ensureDefaultAdmin();
    }

    const res = await withTimeout(
      getDB().collection('users').where({ role, account: acc, password: pwd }).limit(1).get(),
      8000
    );

    if (!res.data.length) {
      throw new Error('ACCOUNT_OR_PASSWORD_INCORRECT');
    }

    const userInfo = res.data[0];

    try {
      await withTimeout(
        getDB().collection('users').doc(userInfo._id).update({
          data: { lastLoginTime: getDB().serverDate() },
        }),
        5000
      );
    } catch (e) { /* 更新失败不阻塞登录 */ }

    const safeUser = this._sanitizeUser(userInfo);
    await this._ensureOpenid(safeUser);
    try { wx.removeStorageSync('jcn_logged_out'); } catch (e) { /* ignore */ }
    this._cacheUser(safeUser);
    return safeUser;
  },

  /**
   * 宠主账号注册
   * @param {Object} payload - { account, password, nickname }
   */
  async registerPetOwner(payload) {
    const account = (payload.account || '').trim();
    const password = (payload.password || '').trim();
    const nickname = (payload.nickname || '').trim() || '宠物主人';

    if (!account || !password) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }
    if (account.length < 3) {
      throw new Error('ACCOUNT_TOO_SHORT');
    }
    if (password.length < 6) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    const existing = await withTimeout(
      getDB().collection('users').where({ account }).limit(1).get(),
      8000
    );
    if (existing.data.length) {
      throw new Error('ACCOUNT_EXISTS');
    }

    await withTimeout(
      getDB().collection('users').add({
        data: {
          role: ROLES.PET_OWNER,
          nickname,
          avatar: '',
          phone: '',
          email: '',
          address: '',
          bio: '',
          account,
          password,
          createTime: getDB().serverDate(),
          lastLoginTime: getDB().serverDate(),
        },
      }),
      8000
    );

    return { success: true };
  },

  /**
   * 机构注册（待管理员审核）
   * 已登录用户不需要账号密码（同一微信号拥有多个角色）
   * @param {Object} payload
   */
  async registerAgency(payload) {
    const data = payload || {};
    const account = (data.account || '').trim();
    const password = (data.password || '').trim();
    const orgName = (data.orgName || '').trim();
    const creditCode = (data.creditCode || '').trim();
    const legalName = (data.legalName || '').trim();
    const legalPhone = (data.legalPhone || '').trim();
    const region = (data.region || '').trim();
    const detailAddress = (data.detailAddress || '').trim();

    if (!orgName || !creditCode || !legalName || !legalPhone || !region || !detailAddress) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    // 已登录用户不需要账号密码（_openid 自动注入，同一微信号多角色）
    const isLoggedIn = !!data._skipAccountCheck;

    if (!isLoggedIn) {
      if (!account || !password) {
        throw new Error('MISSING_REQUIRED_FIELDS');
      }
      // 账号唯一
      const accountRes = await withTimeout(
        getDB().collection('users').where({ account }).limit(1).get(),
        8000
      );
      if (accountRes.data.length) {
        throw new Error('ACCOUNT_EXISTS');
      }
    }

    // 机构名称唯一
    const orgRes = await withTimeout(
      getDB().collection('agency_profiles').where({ orgName }).limit(1).get(),
      8000
    );
    if (orgRes.data.length) {
      throw new Error('ORG_NAME_EXISTS');
    }

    // 社会信用代码唯一
    const codeRes = await withTimeout(
      getDB().collection('agency_profiles').where({ creditCode }).limit(1).get(),
      8000
    );
    if (codeRes.data.length) {
      throw new Error('CREDIT_CODE_EXISTS');
    }

    // 写入机构资料
    const profileRes = await withTimeout(
      getDB().collection('agency_profiles').add({
        data: {
          orgName,
          creditCode,
          legalName,
          legalPhone,
          region,
          detailAddress,
          businessType: data.businessType || '',
          serviceScope: data.serviceScope || '',
          businessHours: data.businessHours || '',
          appointmentMethod: data.appointmentMethod || '',
          totalCages: Number(data.totalCages) || 0,
          cageDesc: data.cageDesc || '',
          emergencyContact: data.emergencyContact || '',
          backupPhone: data.backupPhone || '',
          orgIntro: data.orgIntro || '',
          signatureService: data.signatureService || '',
          licenseImage: data.licenseImage || '',
          permitImage: data.permitImage || '',
          storefrontImage: data.storefrontImage || '',
          auditStatus: 'pending',
          createTime: getDB().serverDate(),
          updateTime: getDB().serverDate(),
        },
      }),
      8000
    );

    // 写入机构用户文档（已登录用户则更新当前用户，否则新建）
    if (isLoggedIn) {
      try {
        const currentUserRes = await withTimeout(
          getDB().collection('users').where({ _openid: '{openid}' }).orderBy('createTime', 'desc').limit(1).get(),
          8000
        );
        if (currentUserRes.data.length > 0) {
          const currentUser = currentUserRes.data[0];
          await withTimeout(
            getDB().collection('users').doc(currentUser._id).update({
              data: {
                nickname: orgName,
                phone: legalPhone,
                agencyProfileId: profileRes._id,
                auditStatus: 'pending',
                updateTime: getDB().serverDate(),
              },
            }),
            8000
          );
          // 清理同一 openid 下无 agencyProfileId 的空白机构文档
          try {
            const blanks = await withTimeout(
              getDB().collection('users').where({
                _openid: '{openid}',
                role: ROLES.AGENCY,
                agencyProfileId: getDB().command.exists(false),
              }).get(),
              5000
            );
            for (const doc of blanks.data) {
              getDB().collection('users').doc(doc._id).remove().catch(() => {});
            }
          } catch (e) { /* 清理失败不影响 */ }
          // 更新缓存
          currentUser.agencyProfileId = profileRes._id;
          currentUser.auditStatus = 'pending';
          this._cacheUser(currentUser);
        } else {
          throw new Error('CANNOT_FIND_CURRENT_USER');
        }
      } catch (e) {
        // 回退到新建用户
        await withTimeout(
          getDB().collection('users').add({
            data: {
              role: ROLES.AGENCY,
              nickname: orgName,
              avatar: '',
              phone: legalPhone,
              email: '',
              address: '',
              bio: '',
              account,
              password,
              agencyProfileId: profileRes._id,
              auditStatus: 'pending',
              createTime: getDB().serverDate(),
              lastLoginTime: getDB().serverDate(),
            },
          }),
          8000
        );
      }
    } else {
      await withTimeout(
        getDB().collection('users').add({
          data: {
            role: ROLES.AGENCY,
            nickname: orgName,
            avatar: '',
            phone: legalPhone,
            email: '',
            address: '',
            bio: '',
            account,
            password,
            agencyProfileId: profileRes._id,
            auditStatus: 'pending',
            createTime: getDB().serverDate(),
            lastLoginTime: getDB().serverDate(),
          },
        }),
        8000
      );
    }

    return { success: true };
  },

  /** 保证默认管理员存在（便于演示） */
  async ensureDefaultAdmin() {
    const res = await withTimeout(
      getDB().collection('users').where({ role: ROLES.ADMIN, account: 'admin' }).limit(1).get(),
      5000
    );
    if (!res.data.length) {
      await withTimeout(
        getDB().collection('users').add({
          data: {
            role: ROLES.ADMIN,
            nickname: '系统管理员',
            account: 'admin',
            password: 'admin123',
            avatar: '',
            phone: '',
            email: '',
            address: '',
            bio: '',
            auditStatus: 'approved',
            createTime: getDB().serverDate(),
            lastLoginTime: getDB().serverDate(),
          },
        }),
        5000
      );
    }
  },

  /**
   * 微信一键登录（按 openid + role 查找，一个微信号可拥有多个角色账号）
   * @param {string} selectedRole - 用户在登录页选择的角色
   * @returns {Object} userInfo
   * @throws {Error} AGENCY_NOT_REGISTERED - 机构账号不存在，需跳转注册
   */
  async loginWithWechat(selectedRole) {
    const role = selectedRole || ROLES.PET_OWNER;
    wx.showLoading({ title: '登录中…', mask: true });

    try {
      // 通过云函数查询该 openid 下所有账号（绕过客户端安全规则限制）
      const findRes = await withTimeout(
        wx.cloud.callFunction({ name: 'ai_handler', data: { action: 'find_user_by_openid' } }),
        10000
      );
      const allAccounts = (findRes.result && findRes.result.accounts) || [];

      // 1. 找到匹配角色的账号 → 直接登录
      const matched = allAccounts.filter((u) => u.role === role);
      if (matched.length > 0) {
        // 优先选择有 agencyProfileId 的机构账号
        let userInfo = matched[0];
        if (role === ROLES.AGENCY) {
          const registered = matched.find(u => u.agencyProfileId);
          if (registered) userInfo = registered;
        }
        try {
          await withTimeout(
            getDB().collection('users').doc(userInfo._id).update({
              data: { lastLoginTime: getDB().serverDate() },
            }),
            5000
          );
        } catch (e) { /* 更新失败不阻塞登录 */ }
        await this._ensureOpenid(userInfo);
        try { wx.removeStorageSync('jcn_logged_out'); } catch (e) { /* ignore */ }
        this._cacheUser(userInfo);
        wx.hideLoading();
        return userInfo;
      }

      // 2. 该 openid 下有其他角色账号 → 不创建，提示用户切换角色
      if (allAccounts.length > 0) {
        wx.hideLoading();
        const ROLE_NAMES = { pet_owner: '宠物主人', agency: '寄养机构', admin: '管理员' };
        const existedRoles = allAccounts.map((u) => ROLE_NAMES[u.role] || u.role);
        const uniqueRoles = [...new Set(existedRoles)];
        wx.showModal({
          title: '账号已存在',
          content: `你已有「${uniqueRoles.join('、')}」账号，请选择对应角色登录`,
          showCancel: false,
        });
        return null;
      }

      // 3. 该 openid 下没有任何账号 → 创建新账号
      wx.hideLoading();
      const roleInfo = ROLE_INFO[role] || ROLE_INFO[ROLES.PET_OWNER];
      wx.showLoading({ title: '注册中…', mask: true });
      const newUser = {
        role,
        nickname: roleInfo.label,
        avatar: '',
        phone: '',
        email: '',
        address: '',
        bio: '',
        createTime: getDB().serverDate(),
        lastLoginTime: getDB().serverDate(),
      };
      if (role === ROLES.AGENCY) {
        newUser.auditStatus = 'pending';
      }
      const addRes = await withTimeout(
        getDB().collection('users').add({ data: newUser }),
        8000
      );

      const newDoc = await withTimeout(
        getDB().collection('users').doc(addRes._id).get(),
        5000
      );
      const userInfo = newDoc.data;
      await this._ensureOpenid(userInfo);
      try { wx.removeStorageSync('jcn_logged_out'); } catch (e) { /* ignore */ }
      this._cacheUser(userInfo);
      wx.hideLoading();
      return userInfo;
    } catch (err) {
      wx.hideLoading();
      console.error('[AuthService] 登录失败', err);
      if (isCloudFetchError(err)) {
        throw new Error('CLOUD_FETCH_FAILED');
      }
      throw err;
    }
  },

  /**
   * 退出登录，清除缓存与全局状态
   */
  logout() {
    try {
      wx.removeStorageSync(STORAGE_KEYS.USER_INFO);
      wx.removeStorageSync(STORAGE_KEYS.LOGIN_TIME);
      wx.setStorageSync('jcn_logged_out', true);
    } catch (e) { /* ignore */ }
    this._syncToGlobal(null);
  },

  /**
   * 按角色跳转到对应首页
   * @param {string} role
   */
  navigateByRole(role) {
    const info = ROLE_INFO[role] || ROLE_INFO[ROLES.PET_OWNER];
    if (info.isTab) {
      wx.switchTab({ url: info.homePage });
    } else {
      wx.redirectTo({ url: info.homePage });
    }
  },

  /**
   * 鉴权守卫：未登录则跳转登录页
   * 适合在 onShow / onLoad 中调用
   * @returns {Object|null}
   */
  async requireAuth() {
    const userInfo = await this.checkLogin();
    if (!userInfo) {
      wx.navigateTo({ url: '/pages/login/login' });
      return null;
    }
    return userInfo;
  },

  /**
   * 确保 userInfo 包含 _openid
   * 优先级：已有值 > 云函数（返回当前用户真实 openid）
   * 注意：不能回退到查询 users 文档的 _openid，因为那是文档创建者的 openid，不一定是当前用户的
   */
  async _ensureOpenid(userInfo) {
    if (!userInfo || userInfo._openid) {
      return userInfo;
    }

    // 方式1：云函数获取（唯一可靠来源，返回当前微信用户的真实 openid）
    try {
      const res = await withTimeout(
        wx.cloud.callFunction({ name: 'ai_handler', data: { action: 'get_openid' } }),
        8000
      );
      if (res.result && res.result.openid) {
        userInfo._openid = res.result.openid;
        this._cacheUser(userInfo);
        return userInfo;
      }
    } catch (e) {
      console.warn('[AuthService] 云函数获取 openid 失败', e.message || e);
    }

    // 方式2：通过 '{openid}' 模板查询当前用户的 users 文档
    // 要求数据库权限为"仅创建者可读写"才能正确过滤
    try {
      const userRes = await withTimeout(
        getDB().collection('users').where({ _openid: '{openid}' }).limit(1).get(),
        5000
      );
      if (userRes.data.length > 0 && userRes.data[0]._openid) {
        userInfo._openid = userRes.data[0]._openid;
        this._cacheUser(userInfo);
        return userInfo;
      }
    } catch (e) {
      console.warn('[AuthService] 数据库查询 openid 失败', e.message || e);
    }

    // 两种方式都失败：不设置 _openid，让调用方处理
    console.error('[AuthService] 无法获取当前用户 openid');
    return userInfo;
  },

  /**
   * 获取当前用户的真实 openid（供页面直接调用）
   * @param {Object} userInfo - checkLogin 返回的用户对象
   * @returns {string} openid
   * @throws {Error} OPENID_UNAVAILABLE 当无法获取 openid 时
   */
  async getOpenid(userInfo) {
    if (userInfo && userInfo._openid) return userInfo._openid;
    await this._ensureOpenid(userInfo);
    if (!userInfo || !userInfo._openid) {
      throw new Error('OPENID_UNAVAILABLE');
    }
    return userInfo._openid;
  },

  /**
   * 获取角色展示信息
   * @param {string} role
   * @returns {Object} { label, desc, icon, homePage, isTab }
   */
  getRoleInfo(role) {
    return ROLE_INFO[role] || ROLE_INFO[ROLES.PET_OWNER];
  },

  // ======================== 私有方法 ========================

  /** 从本地缓存读取用户（带过期判断） */
  _getCachedUser() {
    try {
      const userInfo = wx.getStorageSync(STORAGE_KEYS.USER_INFO);
      const loginTime = wx.getStorageSync(STORAGE_KEYS.LOGIN_TIME);
      if (userInfo && loginTime && Date.now() - loginTime < SESSION_EXPIRE_MS) {
        return userInfo;
      }
      // 过期则清除
      if (userInfo) this.logout();
    } catch (e) { /* ignore */ }
    return null;
  },

  /** 写入本地缓存 + 同步到全局 */
  _cacheUser(userInfo) {
    const safeUser = this._sanitizeUser(userInfo);
    try {
      wx.setStorageSync(STORAGE_KEYS.USER_INFO, safeUser);
      wx.setStorageSync(STORAGE_KEYS.LOGIN_TIME, Date.now());
    } catch (e) {
      console.warn('[AuthService] 缓存写入失败', e);
    }
    this._syncToGlobal(safeUser);
  },

  /** 去除敏感字段 */
  _sanitizeUser(userInfo) {
    if (!userInfo) return userInfo;
    const safe = { ...userInfo };
    delete safe.password;
    return safe;
  },

  /** 同步到 app.globalData */
  _syncToGlobal(userInfo) {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.auth = app.globalData.auth || {};
      app.globalData.auth.userInfo = userInfo;
    }
  },
};

module.exports = authService;
