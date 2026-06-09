/**
 * 共享工具函数
 * 提取各页面重复的工具方法，统一维护
 */

/** 服务分类标题映射 */
const CAT_TITLE_MAP = {
  foster: '宠物寄养',
  grooming: '美容洗护',
  medical: '医疗健康',
  door: '上门服务',
  extra: '商品增值',
};

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|string|number} t
 * @returns {string}
 */
function formatDate(t) {
  if (!t) return '';
  const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm
 * @param {Date|string|number} t
 * @returns {string}
 */
function formatDateTime(t) {
  if (!t) return '';
  const d = typeof t === 'string' ? new Date(t) : (t instanceof Date ? t : new Date(t));
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * 构建宠物信息文本（品种 · 年龄）
 * @param {Object} petInfo
 * @returns {string}
 */
function buildPetInfoText(petInfo) {
  if (!petInfo) return '';
  const species = petInfo.species || '';
  const age = petInfo.age ? `${petInfo.age}岁` : '';
  if (species && age) return `${species} · ${age}`;
  return species || age || '';
}

/**
 * 构建离开剩余时间文本
 * @param {number} leaveTimeMs - 离开时间戳（毫秒）
 * @returns {string}
 */
function buildLeaveRemainText(leaveTimeMs) {
  const ms = Number(leaveTimeMs) || 0;
  if (!ms) return '';
  const diff = ms - Date.now();
  if (diff <= 0) return '已离开（待机构确认）';
  const totalHours = Math.ceil(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `还有${days}天${hours}小时离开`;
  return `还有${hours}小时离开`;
}

/**
 * 判断是否已超过离开时间
 * @param {number} leaveTimeMs
 * @returns {boolean}
 */
function isLeaveExpired(leaveTimeMs) {
  const ms = Number(leaveTimeMs) || 0;
  return ms > 0 && ms <= Date.now();
}

/**
 * 获取状态栏高度（兼容新旧 API）
 * @returns {number} 状态栏高度（px）
 */
function getStatusBarHeight() {
  try {
    if (wx.getWindowInfo) {
      return wx.getWindowInfo().statusBarHeight || 20;
    }
    return wx.getSystemInfoSync().statusBarHeight || 20;
  } catch (e) {
    return 20;
  }
}

module.exports = {
  CAT_TITLE_MAP,
  formatDate,
  formatDateTime,
  buildPetInfoText,
  buildLeaveRemainText,
  isLeaveExpired,
  getStatusBarHeight,
};
