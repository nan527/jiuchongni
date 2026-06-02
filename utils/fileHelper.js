/**
 * 将 cloud:// 文件 ID 列表转为临时 HTTP URL
 * 使用云函数转换（管理员权限，不受"仅创建者可读"限制）
 * @param {string[]} fileIDs
 * @returns {Promise<string[]>} 临时 URL 数组，失败项返回原 fileID
 */
async function resolveTempUrls(fileIDs) {
  if (!fileIDs || !fileIDs.length) return fileIDs || [];
  try {
    const res = await wx.cloud.callFunction({
      name: 'ai_handler',
      data: { action: 'get_file_urls', fileIDs },
    });
    if (res.result && res.result.success) {
      return res.result.urls || fileIDs;
    }
    // 云函数失败，过滤掉 cloud:// 开头的无效 URL
    return fileIDs.map(id => id.startsWith('cloud://') ? '' : id).filter(Boolean);
  } catch (e) {
    console.warn('[resolveTempUrls] 云函数调用失败', e);
    return fileIDs.map(id => id.startsWith('cloud://') ? '' : id).filter(Boolean);
  }
}

/**
 * 处理 agency_profiles 列表中的图片字段，将 cloud:// 转为临时 URL
 * 支持字段：storefrontImage, licenseImage, permitImage, envImages
 * @param {Object[]} agencies
 * @returns {Promise<Object[]>}
 */
async function resolveAgencyImages(agencies) {
  if (!agencies || !agencies.length) return agencies || [];

  const fileMap = new Map();
  for (const agency of agencies) {
    for (const field of ['storefrontImage', 'licenseImage', 'permitImage']) {
      const val = agency[field];
      if (val && typeof val === 'string' && val.startsWith('cloud://')) {
        if (!fileMap.has(val)) fileMap.set(val, null);
      }
    }
    if (Array.isArray(agency.envImages)) {
      for (const url of agency.envImages) {
        if (url && typeof url === 'string' && url.startsWith('cloud://')) {
          if (!fileMap.has(url)) fileMap.set(url, null);
        }
      }
    }
  }

  if (fileMap.size === 0) return agencies;

  const allIDs = [...fileMap.keys()];
  const resolved = await resolveTempUrls(allIDs);
  for (let i = 0; i < allIDs.length; i++) {
    fileMap.set(allIDs[i], resolved[i]);
  }

  return agencies.map(agency => {
    const item = { ...agency };
    for (const field of ['storefrontImage', 'licenseImage', 'permitImage']) {
      if (item[field] && fileMap.has(item[field])) {
        item[field] = fileMap.get(item[field]);
      }
    }
    if (Array.isArray(item.envImages)) {
      item.envImages = item.envImages.map(url =>
        fileMap.has(url) ? fileMap.get(url) : url
      );
    }
    return item;
  });
}

module.exports = { resolveTempUrls, resolveAgencyImages };
