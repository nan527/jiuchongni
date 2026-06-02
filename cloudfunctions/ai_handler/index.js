// cloudfunctions/ai_handler/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios'); // 建议通过 npm 安装

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 开源大模型 API 配置 (以 DeepSeek/Qwen 为例)
const API_URL = 'https://api.deepseek.com/v1/chat/completions'; // 你的 API URL
const API_KEY = process.env.AI_API_KEY || 'YOUR_API_KEY'; // 在云开发控制台环境变量中配置

exports.main = async (event, context) => {
  const { action } = event;

  // 按 action 分发不同场景
  switch (action) {
    case 'analyze_health':
      return await analyzeHealth(event);
    case 'get_openid':
      return { success: true, openid: cloud.getWXContext().OPENID };
    case 'delete_agency':
      return await deleteAgency(event);
    case 'get_file_urls':
      return await getFileUrls(event);
    case 'cleanup_orphaned_agencies':
      return await cleanupOrphanedAgencies();
    case 'migrate_ownerid':
      return await migrateOwnerId(event);
    default:
      return { success: false, msg: '未知操作: ' + action };
  }
};

/**
 * 迁移旧数据：为缺少 ownerId 的记录补上 ownerId
 * 根据记录的 _openid 查询 users 集合找到对应的用户 _id
 */
async function migrateOwnerId(event) {
  const db = cloud.database();
  const _ = db.command;
  const collections = ['pets', 'user_orders', 'health_records'];
  const results = {};

  for (const colName of collections) {
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // 分批获取所有记录（云函数每次最多100条）
      let hasMore = true;
      let lastId = null;

      while (hasMore) {
        let query = db.collection(colName).orderBy('_id', 'asc').limit(100);
        if (lastId) {
          query = query.where({ _id: _.gt(lastId) });
        }
        const res = await query.get();
        const records = res.data;

        if (records.length === 0) {
          hasMore = false;
          break;
        }

        for (const record of records) {
          lastId = record._id;

          // 已有 ownerId 则跳过
          if (record.ownerId) {
            skipped++;
            continue;
          }

          // 没有 _openid 则跳过（无法关联用户）
          if (!record._openid) {
            skipped++;
            continue;
          }

          try {
            // 根据 _openid 查询 users 集合找到用户
            const userRes = await db.collection('users').where({ _openid: record._openid }).limit(1).get();
            if (userRes.data.length > 0) {
              const userId = userRes.data[0]._id;
              await db.collection(colName).doc(record._id).update({
                data: { ownerId: userId },
              });
              migrated++;
            } else {
              // 找不到对应用户，用 _openid 作为 ownerId 兜底
              await db.collection(colName).doc(record._id).update({
                data: { ownerId: record._openid },
              });
              migrated++;
            }
          } catch (e) {
            errors++;
          }
        }

        if (records.length < 100) {
          hasMore = false;
        }
      }
    } catch (e) {
      results[colName] = { error: e.message };
      continue;
    }

    results[colName] = { migrated, skipped, errors };
  }

  return { success: true, results };
}

/**
 * 健康数据智能分析
 * @param {Object} event - { action, pet_info, current_data }
 *                        或 { action, petId, healthData }
 */
async function analyzeHealth(event) {
  try {
    // 兼容两种调用方式
    let petInfo = event.pet_info;
    const healthData = event.current_data || event.healthData || {};

    // 如果传入的是 petId，从数据库查询
    if (!petInfo && event.petId) {
      const res = await cloud.database().collection('pets').doc(event.petId).get();
      petInfo = res.data;
    }

    if (!petInfo) {
      return { success: false, suggestion: '未找到宠物信息，请先录入宠物档案。' };
    }

    // 拼接 Prompt
    const prompt = `您是一位专业的宠物健康顾问。
宠物信息: 品种 ${petInfo.species || '未知'}, 年龄 ${petInfo.age || '未知'} 岁, 性格 ${petInfo.character || '未知'}。
当前数据: 体重 ${healthData.weight || '未知'}kg, 进食量 ${healthData.food || '正常'}。
请根据以上数据，给出一段简短的(50字以内)养护建议，如果发现体重异常请特别提示。`;

    const response = await axios.post(API_URL, {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: 15000,
    });

    const suggestion = response.data.choices[0].message.content;

    return {
      success: true,
      suggestion,
      suggestion_tags: extractTags(suggestion),
    };
  } catch (err) {
    console.error('[ai_handler] analyzeHealth 异常', err);
    return {
      success: false,
      suggestion: 'AI 暂时无法响应，建议咨询宠物医院。',
    };
  }
}

/** 简易标签提取（可后续优化） */
function extractTags(text) {
  const keywords = ['控制饮食', '多运动', '补充营养', '注意保暖', '定期体检', '减少零食'];
  return keywords.filter((kw) => text.includes(kw));
}

/**
 * 删除机构（管理员操作）
 * 同时删除 users 文档和 agency_profiles 文档
 * @param {Object} event - { userId, profileId } 至少提供一个
 */
async function deleteAgency(event) {
  let { userId, profileId } = event;
  if (!userId && !profileId) {
    return { success: false, msg: '缺少 userId 或 profileId' };
  }
  const db = cloud.database();
  try {
    // 如果只有 profileId，查找对应的 users 文档
    if (!userId && profileId) {
      const userRes = await db.collection('users').where({ agencyProfileId: profileId }).limit(1).get();
      if (userRes.data.length > 0) {
        userId = userRes.data[0]._id;
      }
    }
    if (userId) {
      await db.collection('users').doc(userId).remove();
    }
    if (profileId) {
      await db.collection('agency_profiles').doc(profileId).remove();
    }
    return { success: true };
  } catch (err) {
    console.error('[deleteAgency] 删除失败', err);
    return { success: false, msg: err.message };
  }
}

/**
 * 清理孤立的机构数据（管理员操作）
 * 1. 删除没有对应 users 文档的 agency_profiles（孤立资料）
 * 2. 删除没有对应 agency_profiles 文档的 users（孤立账号）
 */
async function cleanupOrphanedAgencies() {
  const db = cloud.database();
  const _ = db.command;
  let deletedProfiles = 0;
  let deletedUsers = 0;

  try {
    // 1. 查找所有 agency_profiles，找出没有对应 users 文档的
    let hasMore = true;
    let lastId = null;
    while (hasMore) {
      let query = db.collection('agency_profiles').orderBy('_id', 'asc').limit(100);
      if (lastId) query = query.where({ _id: _.gt(lastId) });
      const res = await query.get();
      const profiles = res.data;
      if (!profiles.length) break;

      for (const profile of profiles) {
        lastId = profile._id;
        const userRes = await db.collection('users').where({ agencyProfileId: profile._id }).limit(1).get();
        if (userRes.data.length === 0) {
          await db.collection('agency_profiles').doc(profile._id).remove();
          deletedProfiles++;
        }
      }
      if (profiles.length < 100) hasMore = false;
    }

    // 2. 查找 role=agency 的 users，找出没有对应 agency_profiles 文档的
    hasMore = true;
    lastId = null;
    while (hasMore) {
      let query = db.collection('users').where({ role: 'agency' }).orderBy('_id', 'asc').limit(100);
      if (lastId) query = query.where({ _id: _.gt(lastId) });
      const res = await query.get();
      const users = res.data;
      if (!users.length) break;

      for (const user of users) {
        lastId = user._id;
        if (!user.agencyProfileId) {
          await db.collection('users').doc(user._id).remove();
          deletedUsers++;
          continue;
        }
        const profileRes = await db.collection('agency_profiles').doc(user.agencyProfileId).get().catch(() => null);
        if (!profileRes || !profileRes.data) {
          await db.collection('users').doc(user._id).remove();
          deletedUsers++;
        }
      }
      if (users.length < 100) hasMore = false;
    }

    return { success: true, deletedProfiles, deletedUsers };
  } catch (err) {
    console.error('[cleanupOrphanedAgencies] 清理失败', err);
    return { success: false, msg: err.message, deletedProfiles, deletedUsers };
  }
}

/**
 * 将 cloud:// 文件 ID 转为临时 HTTP URL（管理员权限，不受创建者限制）
 * @param {Object} event - { fileIDs: string[] }
 */
async function getFileUrls(event) {
  const { fileIDs } = event;
  if (!fileIDs || !fileIDs.length) return { success: true, urls: [] };
  try {
    const res = await cloud.getTempFileURL({ fileList: fileIDs });
    const urls = (res.fileList || []).map((item, i) => {
      if (item.tempFileURL) return item.tempFileURL;
      return fileIDs[i]; // 失败时返回原始 ID
    });
    return { success: true, urls };
  } catch (err) {
    console.error('[getFileUrls] 转换失败', err);
    return { success: false, msg: err.message, urls: fileIDs };
  }
}
