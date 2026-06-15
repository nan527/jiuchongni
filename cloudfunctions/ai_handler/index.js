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
  try {
  switch (action) {
    case 'analyze_health':
      return await analyzeHealth(event);
    case 'generate_caption':
      return await generateCaption(event);
    case 'ai_recommend':
      return await aiRecommend(event);
    case 'get_openid':
      return { success: true, openid: cloud.getWXContext().OPENID };
    case 'find_user_by_openid':
      return await findUserByOpenid(event);
    case 'delete_agency':
      return await deleteAgency(event);
    case 'get_file_urls':
      return await getFileUrls(event);
    case 'cleanup_orphaned_agencies':
      return await cleanupOrphanedAgencies();
    case 'update_agency_audit':
      return await updateAgencyAudit(event);
    case 'migrate_ownerid':
      return await migrateOwnerId(event);
    case 'reset_password':
      return await resetPassword(event);
    case 'bind_wechat':
      return await bindWechat(event);
    case 'generate_image':
      return await generateImage(event);
    case 'download_and_save':
      return await downloadAndSave(event);
    case 'get_api_configs':
      return await getApiConfigs(event);
    case 'save_api_config':
      return await saveApiConfig(event);
    case 'check_quota':
      return await checkQuota(event);
    case 'use_quota':
      return await useQuota(event);
    case 'get_user_balance':
      return await getUserBalance(event);
    case 'recharge':
      return await recharge(event);
    case 'deduct_balance':
      return await deductBalance(event);
    case 'get_balance_logs':
      return await getBalanceLogs(event);
    case 'init_api_configs':
      return await initApiConfigs();
    case 'insert_test_health':
      return await insertTestHealth(event);
    case 'smart_match_parse':
      return await smartMatchParse(event);
    case 'health_risk_analysis':
      return await healthRiskAnalysis(event);
    case 'pet_service_customize':
      return await petServiceCustomize(event);
    case 'update_model_prices':
      return await updateModelPrices(event);
    case 'cleanup_duplicate_configs':
      return await cleanupDuplicateConfigs();
    default:
      return { success: false, msg: '未知操作: ' + action };
  }
  } catch (mainErr) {
    console.error('[ai_handler] 未捕获异常:', mainErr.message);
    return { success: false, msg: '服务内部错误: ' + mainErr.message };
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

    const apiResult = await callAnalysisAPI(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, max_tokens: 500 }
    );

    if (!apiResult.success) {
      return {
        success: false,
        suggestion: '分析 API 未配置或调用失败，请在管理后台设置 API Key。',
      };
    }

    const suggestion = apiResult.content;

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
 * AI 配文生成
 * 根据宠物信息和照片描述，生成个性化的社交媒体配文
 * @param {Object} event - { petInfo, photoDescription, style }
 */
async function generateCaption(event) {
  try {
    const { petInfo, photoDescription, style } = event;

    if (!petInfo) {
      return { success: false, msg: '请先选择宠物' };
    }

    // 构建 prompt
    const styleMap = {
      warm: '温馨治愈风',
      funny: '搞笑幽默风',
      art: '文艺清新风',
    };
    const styleName = styleMap[style] || '温馨治愈风';

    const prompt = `你是一位专业的宠物自媒体博主，擅长为宠物照片撰写吸引人的配文。

宠物信息：
- 品种：${petInfo.breed || petInfo.species || '未知'}
- 年龄：${petInfo.age || '未知'}岁
- 性格：${petInfo.character || '活泼可爱'}

照片描述：${photoDescription || '宠物生活照'}

请生成 3 条${styleName}的配文（每条 30-50 字），要求：
1. 包含 2-3 个合适的 emoji
2. 适合发朋友圈或小红书
3. 语言生动有趣，能引起共鸣

请按以下格式返回，每条配文占一行：
[配文1]
[配文2]
[配文3]`;

    const response = await callDeepSeekAPI(prompt);

    // 解析返回的配文
    const captions = parseCaptions(response);

    return {
      success: true,
      captions,
    };
  } catch (err) {
    console.error('[ai_handler] generateCaption 异常', err);
    return {
      success: false,
      msg: 'AI 配文生成失败，请稍后重试',
      captions: [],
    };
  }
}

/**
 * 解析 AI 返回的配文
 */
function parseCaptions(text) {
  if (!text) return [];

  // 尝试提取 [...] 格式的配文
  const bracketMatches = text.match(/\[([^\]]+)\]/g);
  if (bracketMatches && bracketMatches.length >= 3) {
    return bracketMatches.slice(0, 3).map(m => m.replace(/[\[\]]/g, '').trim());
  }

  // 如果没有 [] 格式，按行分割
  const lines = text.split('\n').filter(line => line.trim() && !line.includes('配文'));
  return lines.slice(0, 3).map(line => {
    // 移除可能的序号前缀
    return line.replace(/^\d+[\.\、\)\s]+/, '').trim();
  });
}

/**
 * AI 智能推荐
 * 基于宠物信息和用户偏好，推荐最合适的机构
 * @param {Object} event - { petInfo, agencies, userPrefs }
 */
async function aiRecommend(event) {
  try {
    const { petInfo, agencies, userPrefs } = event;

    if (!petInfo) {
      return { success: false, msg: '请先选择宠物' };
    }

    if (!agencies || agencies.length === 0) {
      return { success: false, msg: '暂无推荐机构' };
    }

    // 构建 prompt
    const prompt = `你是一位专业的宠物服务顾问，擅长为宠物主人推荐最合适的寄养机构。

宠物信息：
- 品种：${petInfo.breed || petInfo.species || '未知'}
- 年龄：${petInfo.age || '未知'}岁
- 特殊需求：${petInfo.specialNeeds || '无'}

用户偏好：${(userPrefs || []).join('、') || '无特殊要求'}

候选机构（共 ${agencies.length} 家）：
${agencies.map((a, i) => `${i + 1}. ${a.name || '机构' + (i + 1)} - ${a.description || '专业宠物服务'}，类型：${a.type || '综合'}，评分：${a.score || '暂无'}`).join('\n')}

请推荐前 3 家机构，并为每家机构生成：
1. 推荐理由（20-30字，要体现为什么适合这只宠物）
2. 匹配度评分（80-100分）
3. 该机构的最大优势（10字以内）

请严格按以下 JSON 格式返回（不要添加其他内容）：
[
  {"name": "机构名", "reason": "推荐理由", "score": 95, "advantage": "最大优势"},
  {"name": "机构名", "reason": "推荐理由", "score": 90, "advantage": "最大优势"},
  {"name": "机构名", "reason": "推荐理由", "score": 85, "advantage": "最大优势"}
]`;

    const response = await callDeepSeekAPI(prompt);

    // 解析返回的推荐结果
    const recommendations = parseRecommendations(response, agencies);

    return {
      success: true,
      recommendations,
    };
  } catch (err) {
    console.error('[ai_handler] aiRecommend 异常', err);
    return {
      success: false,
      msg: 'AI 推荐失败，请稍后重试',
      recommendations: [],
    };
  }
}

/**
 * 解析 AI 返回的推荐结果
 */
function parseRecommendations(text, originalAgencies) {
  if (!text) return [];

  try {
    // 尝试提取 JSON 数组
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 3).map((item, i) => ({
          name: item.name || originalAgencies[i]?.name || '推荐机构',
          reason: item.reason || '综合评分较高',
          score: Math.min(100, Math.max(80, item.score || 90)),
          advantage: item.advantage || '服务优质',
        }));
      }
    }
  } catch (e) {
    // JSON 解析失败，使用降级方案
  }

  // 降级：从原始机构中随机选 3 个
  const shuffled = [...originalAgencies].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3).map((a, i) => ({
    name: a.name || '推荐机构',
    reason: '综合评分较高，适合您的宠物',
    score: 95 - i * 5,
    advantage: '服务优质',
  }));
}

/**
 * 调用 DeepSeek API
 */
async function callDeepSeekAPI(prompt) {
  const response = await axios.post(API_URL, {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1000,
  }, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 30000,
  });

  return response.data.choices[0].message.content;
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
 * 管理员审核机构（更新 users + agency_profiles 的 auditStatus）
 */
async function updateAgencyAudit(event) {
  const { userId, profileId, status } = event;
  if (!userId || !status) return { success: false, msg: '参数缺失' };
  const db = cloud.database();
  try {
    await db.collection('users').doc(userId).update({ data: { auditStatus: status } });
    if (profileId) {
      await db.collection('agency_profiles').doc(profileId).update({
        data: { auditStatus: status, updateTime: db.serverDate() },
      });
    }
    return { success: true };
  } catch (err) {
    console.error('[updateAgencyAudit] 失败', err);
    return { success: false, msg: err.message };
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

/**
 * 重置机构账号密码（用于忘记密码场景）
 * @param {Object} event - { account, newPassword }
 */
async function resetPassword(event) {
  const { account, newPassword } = event;
  if (!account || !newPassword) {
    return { success: false, msg: '缺少账号或新密码' };
  }
  try {
    const db = cloud.database();
    const res = await db.collection('users').where({ account, role: 'agency' }).limit(1).get();
    if (!res.data.length) {
      return { success: false, msg: '账号不存在' };
    }
    await db.collection('users').doc(res.data[0]._id).update({
      data: { password: newPassword },
    });
    return { success: true, msg: '密码重置成功' };
  } catch (err) {
    console.error('[resetPassword] 失败', err);
    return { success: false, msg: err.message };
  }
}

/**
 * 将当前微信 openid 绑定到指定用户（用于机构账号登录后绑定微信号）
 * @param {Object} event - { userId }
 */
async function bindWechat(event) {
  const { userId } = event || {};
  try {
    const openid = cloud.getWXContext().OPENID;
    if (!openid) {
      return { success: false, msg: '无法获取当前用户 openid' };
    }
    const db = cloud.database();
    const _ = db.command;

    // 如果传了 userId，直接绑定并清理
    if (userId) {
      await db.collection('users').doc(userId).update({
        data: { _openid: openid },
      });
      // 清理同一微信号下无 agencyProfileId 的空白机构文档
      const existing = await db.collection('users')
        .where({ _openid: openid, role: 'agency', agencyProfileId: _.exists(false) })
        .get();
      for (const doc of existing.data) {
        if (doc._id !== userId) {
          await db.collection('users').doc(doc._id).remove();
        }
      }
      return { success: true, openid };
    }

    // 没有 userId：查找当前微信下面有没有已注册的机构账号
    const users = await db.collection('users')
      .where({ _openid: openid, role: 'agency', agencyProfileId: _.exists(true) })
      .limit(5)
      .get();

    if (users.data.length > 0) {
      // 清理空白机构文档
      const blanks = await db.collection('users')
        .where({ _openid: openid, role: 'agency', agencyProfileId: _.exists(false) })
        .get();
      for (const doc of blanks.data) {
        await db.collection('users').doc(doc._id).remove().catch(() => {});
      }

      return {
        success: true,
        found: true,
        users: users.data.map(u => ({
          _id: u._id,
          agencyProfileId: u.agencyProfileId,
          auditStatus: u.auditStatus,
          nickname: u.nickname,
        })),
      };
    }

    return { success: true, found: false };
  } catch (err) {
    console.error('[bindWechat] 失败', err);
    return { success: false, msg: err.message };
  }
}

/**
 * 根据 openid 查询该用户所有角色的账号（管理员权限，不受安全规则限制）
 * @param {Object} event - { role?: string } 可选，指定角色
 */
async function findUserByOpenid(event) {
  const db = cloud.database();
  const openid = cloud.getWXContext().OPENID;
  try {
    const res = await db.collection('users').where({ _openid: openid }).get();
    return { success: true, accounts: res.data || [], openid };
  } catch (err) {
    console.error('[findUserByOpenid] 查询失败', err);
    return { success: false, msg: err.message, accounts: [], openid };
  }
}

/**
 * AI 图片生成（图生图）
 * 支持 SiliconFlow、通义万相、自定义 API
 * apiKey 从 api_configs 集合读取，不再由前端传入
 * @param {Object} event - { model, imageUrl, prompt, style }
 */
async function generateImage(event) {
  const { model, imageUrl, prompt, style } = event;
  const db = cloud.database();

  if (!model) {
    return { success: false, msg: '请选择模型' };
  }
  if (!imageUrl) {
    return { success: false, msg: '请先上传照片' };
  }

  // 从 api_configs 读取 API 配置
  const configRes = await db.collection('api_configs').where({ model, enabled: true }).get();
  if (!configRes.data || configRes.data.length === 0) {
    return { success: false, msg: '该模型未配置 API Key，请联系管理员' };
  }
  const config = configRes.data[0];
  const apiKey = config.apiKey;
  if (!apiKey) {
    return { success: false, msg: '该模型的 API Key 未填写，请联系管理员' };
  }

  const provider = config.provider || 'siliconflow';
  const customEndpoint = config.customEndpoint || '';

  try {
    switch (provider) {
      case 'siliconflow':
        return await generateWithSiliconFlow(apiKey, imageUrl, prompt, style, model);
      case 'tongyiwanxiang':
        return await generateWithTongyiWanxiang(apiKey, imageUrl, prompt, style);
      case 'custom':
        return await generateWithCustomAPI(apiKey, customEndpoint, imageUrl, prompt, style);
      default:
        return { success: false, msg: '不支持的服务商: ' + provider };
    }
  } catch (err) {
    console.error('[ai_handler] generateImage 异常', err);
    return { success: false, msg: err.message || '图片生成失败，请稍后重试' };
  }
}

/**
 * SiliconFlow 图生图
 * API 文档: https://docs.siliconflow.cn/api-reference/images/images-generations
 */
async function generateWithSiliconFlow(apiKey, imageUrl, prompt, style, model) {
  // 下载图片并转为 base64
  const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const base64Image = Buffer.from(imageRes.data).toString('base64');
  const mimeType = imageUrl.includes('.png') ? 'image/png' : 'image/jpeg';

  // 风格映射为英文提示词增强
  const styleEnhance = {
    cartoon: 'cartoon style, cute, colorful, chibi, vivid colors',
    watercolor: 'watercolor painting style, soft colors, artistic, delicate',
    pixel: 'pixel art style, retro game, 8-bit, blocky',
    oil: 'oil painting style, classical art, rich textures, thick brushstrokes',
    anime: 'anime style, Japanese animation, vibrant, cel shading',
    cyber: 'cyberpunk style, neon lights, futuristic, dark background',
  };

  const enhancedPrompt = `${prompt}, ${styleEnhance[style] || 'artistic style'}`;

  // 默认使用 Kwai-Kolors/Kolors（支持图生图）
  const selectedModel = model || 'Kwai-Kolors/Kolors';

  const requestBody = {
    model: selectedModel,
    prompt: enhancedPrompt,
    image: `data:${mimeType};base64,${base64Image}`,
    image_size: '1024x1024',
  };

  // SDXL 系列支持 strength 参数
  if (selectedModel.includes('stable-diffusion')) {
    requestBody.image_strength = 0.55;
    requestBody.num_inference_steps = 30;
    requestBody.guidance_scale = 7.5;
  }

  const response = await axios.post(
    'https://api.siliconflow.cn/v1/images/generations',
    requestBody,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  const result = response.data;
  if (result.data && result.data.length > 0 && result.data[0].url) {
    return { success: true, imageUrl: result.data[0].url };
  }

  return { success: false, msg: 'SiliconFlow 未返回有效结果，响应: ' + JSON.stringify(result).slice(0, 200) };
}

/**
 * 通义万相 图生图
 * API 文档: https://help.aliyun.com/zh/dashscope/developer-reference/api-details
 */
async function generateWithTongyiWanxiang(apiKey, imageUrl, prompt, style) {
  // apiKey 格式: "AccessKeyID,AccessKeySecret"
  const [accessKeyId, accessKeySecret] = apiKey.split(',').map(s => s.trim());
  if (!accessKeyId || !accessKeySecret) {
    return { success: false, msg: '通义万相的 API Key 格式应为: AccessKeyID,AccessKeySecret' };
  }

  // 下载图片并转为 base64
  const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const base64Image = Buffer.from(imageRes.data).toString('base64');

  // 风格映射
  const styleMap = {
    cartoon: '卡通',
    watercolor: '水彩',
    pixel: '像素',
    oil: '油画',
    anime: '动漫',
    cyber: '赛博朋克',
  };

  const styleName = styleMap[style] || '卡通';

  // 生成签名（简化版，实际应使用阿里云 SDK）
  // 注意：生产环境建议使用 @alicloud/dysmsapi 或 DashScope SDK
  const requestBody = {
    model: 'wanx-v1',
    input: {
      prompt: `${prompt}，${styleName}风格`,
      base64: base64Image,
    },
    parameters: {
      n: 1,
      size: '1024*1024',
    },
  };

  // 获取 Bearer Token（简化处理）
  const tokenRes = await axios.post(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    {
      model: 'qwen-turbo',
      input: { messages: [{ role: 'user', content: 'test' }] },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  ).catch(() => null);

  // 直接使用 DashScope API 调用通义万相
  const response = await axios.post(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis',
    requestBody,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      timeout: 60000,
    }
  );

  const result = response.data;

  // 异步任务模式：需要轮询结果
  if (result.output && result.output.task_id) {
    const taskId = result.output.task_id;
    // 轮询结果（最多等待 60 秒）
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const pollRes = await axios.get(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      );

      const taskResult = pollRes.data;
      if (taskResult.output && taskResult.output.task_status === 'SUCCEEDED') {
        const results = taskResult.output.results || [];
        if (results.length > 0 && results[0].url) {
          return { success: true, imageUrl: results[0].url };
        }
      } else if (taskResult.output && taskResult.output.task_status === 'FAILED') {
        return { success: false, msg: taskResult.output.message || '通义万相生成失败' };
      }
    }
    return { success: false, msg: '通义万相生成超时' };
  }

  // 同步模式
  if (result.output && result.output.results && result.output.results.length > 0) {
    return { success: true, imageUrl: result.output.results[0].url };
  }

  return { success: false, msg: '通义万相未返回有效结果' };
}

/**
 * 自定义 API 图生图
 * 约定：POST 请求，body 包含 { imageUrl, prompt, style }
 * 期望返回：{ url: "生成的图片URL" } 或 { imageUrl: "..." } 或 { base64: "..." }
 */
async function generateWithCustomAPI(apiKey, endpoint, imageUrl, prompt, style) {
  if (!endpoint) {
    return { success: false, msg: '请填写自定义 API 接口地址' };
  }

  const response = await axios.post(
    endpoint,
    { imageUrl, prompt, style },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  const result = response.data;

  // 支持多种返回格式
  if (result.url) {
    return { success: true, imageUrl: result.url };
  }
  if (result.imageUrl) {
    return { success: true, imageUrl: result.imageUrl };
  }
  if (result.base64) {
    // 如果返回 base64，需要上传到云存储
    const buffer = Buffer.from(result.base64, 'base64');
    const cloudPath = `ai_works/custom_${Date.now()}.jpg`;
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer,
    });
    return { success: true, imageUrl: uploadRes.fileID, fileID: uploadRes.fileID };
  }

  return { success: false, msg: '自定义 API 返回格式不符合约定' };
}

/**
 * 下载图片并保存到云存储（绕过小程序域名白名单限制）
 * @param {Object} event - { imageUrl }
 */
async function downloadAndSave(event) {
  const { imageUrl } = event;
  if (!imageUrl) {
    return { success: false, msg: '缺少图片 URL' };
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const cloudPath = `ai_works/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(response.data),
    });

    return { success: true, fileID: uploadRes.fileID };
  } catch (err) {
    console.error('[downloadAndSave] 失败', err);
    return { success: false, msg: err.message || '下载保存失败' };
  }
}

// ==================== API 配置管理 ====================

/**
 * 获取 API 配置列表
 * 管理员：返回完整配置（含 apiKey）
 * 普通用户：隐藏 apiKey，只返回模型信息
 * @param {Object} event - { category, isAdmin }
 */
async function getApiConfigs(event) {
  const { category, isAdmin } = event;
  const db = cloud.database();
  const where = category ? { category } : {};

  try {
    const res = await db.collection('api_configs').where(where).get();
    let data = res.data || [];

    // 普通用户隐藏 apiKey
    if (!isAdmin) {
      data = data.map(item => ({
        _id: item._id,
        category: item.category,
        provider: item.provider,
        model: item.model,
        modelName: item.modelName,
        tier: item.tier,
        enabled: item.enabled,
        dailyFreeQuota: item.dailyFreeQuota,
        pricePerUse: item.pricePerUse,
      }));
    }

    return { success: true, data };
  } catch (err) {
    console.error('[getApiConfigs] 失败', err);
    return { success: false, msg: err.message || '获取配置失败' };
  }
}

/**
 * 管理员保存 API 配置
 * @param {Object} event - { _id, apiKey, customEndpoint, enabled }
 */
async function saveApiConfig(event) {
  const { _id, apiKey, customEndpoint, enabled } = event;
  const db = cloud.database();

  if (!_id) {
    return { success: false, msg: '缺少配置 ID' };
  }

  try {
    const updateData = { updatedAt: db.serverDate() };
    if (apiKey !== undefined) updateData.apiKey = apiKey;
    if (customEndpoint !== undefined) updateData.customEndpoint = customEndpoint;
    if (enabled !== undefined) updateData.enabled = enabled;

    await db.collection('api_configs').doc(_id).update({ data: updateData });
    return { success: true, msg: '保存成功' };
  } catch (err) {
    console.error('[saveApiConfig] 失败', err);
    return { success: false, msg: err.message || '保存失败' };
  }
}

// ==================== 额度管理 ====================

/**
 * 获取今天的日期字符串
 */
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 统一调用分析 API — 强制使用 MiMo 模型
 * apiKey 优先从 api_configs 读取，其次用环境变量 MIMO_API_KEY / AI_API_KEY
 */
async function callAnalysisAPI(messages, options = {}) {
  const DEFAULT_MIMO_ENDPOINT = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
  const db = cloud.database();

  // 1. 从 api_configs 获取 MiMo 配置
  let apiKey = '';
  let model = 'mimo-v2.5-pro';
  let endpoint = DEFAULT_MIMO_ENDPOINT;

  try {
    const configRes = await db.collection('api_configs')
      .where({ category: 'analysis', enabled: true })
      .get();
    const configs = (configRes.data || [])
      .sort((a, b) => {
        const tierOrder = { high: 0, medium: 1, low: 2 };
        return (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2);
      });

    console.log('[callAnalysisAPI] 找到 analysis 配置:', configs.length, '条');
    for (const c of configs) {
      console.log(`[callAnalysisAPI] 配置: model=${c.model}, enabled=${c.enabled}, hasKey=${!!c.apiKey}, endpoint=${c.customEndpoint || '默认'}`);
      if (c.apiKey) {
        apiKey = c.apiKey;
        model = c.model;
        if (c.customEndpoint) endpoint = c.customEndpoint;
        break;
      }
    }
  } catch (e) {
    console.warn('[callAnalysisAPI] 读取 api_configs 失败:', e.message);
  }

  // 2. 兜底：环境变量
  if (!apiKey) {
    apiKey = process.env.MIMO_API_KEY || process.env.AI_API_KEY || '';
    if (apiKey) console.log('[callAnalysisAPI] 使用环境变量 API Key');
  }

  if (!apiKey) {
    return { success: false, msg: '未配置 MiMo API Key，请在管理后台或云函数环境变量中配置' };
  }

  console.log(`[callAnalysisAPI] 调用: endpoint=${endpoint}, model=${model}, key前缀=${apiKey.slice(0, 6)}...`);

  // 3. 调用 MiMo
  try {
    const res = await axios.post(endpoint, {
      model,
      messages,
      temperature: options.temperature || 0.5,
      max_tokens: options.max_tokens || 1500,
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: options.timeout || 60000,
    });

    const choice = res.data.choices[0];
    const content = (choice.message && (choice.message.content || choice.message.reasoning_content)) || '';
    if (content) {
      return { success: true, content, model };
    }
    return { success: false, msg: 'MiMo 返回内容为空' };
  } catch (err) {
    const status = err.response ? err.response.status : '无';
    const errData = err.response ? JSON.stringify(err.response.data).slice(0, 200) : '';
    console.error(`[callAnalysisAPI] ${model} 调用失败: status=${status}, message=${err.message}, data=${errData}`);
    if (status === 401) {
      return { success: false, msg: `MiMo API Key 无效（401），请在管理后台检查 apiKey 是否正确。endpoint=${endpoint}` };
    }
    return { success: false, msg: `MiMo 调用失败: ${err.message}` };
  }
}

/**
 * 检查用户今天的免费额度
 * @param {Object} event - { model }
 */
async function checkQuota(event) {
  const { model } = event;
  const db = cloud.database();
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  const today = getTodayStr();

  try {
    // 获取模型配置
    const configRes = await db.collection('api_configs').where({ model }).get();
    if (!configRes.data || configRes.data.length === 0) {
      return { success: false, msg: '模型未配置' };
    }
    const config = configRes.data[0];
    const freeQuota = config.dailyFreeQuota || 0;

    // 查询今天的使用次数
    const quotaRes = await db.collection('ai_quotas')
      .where({ _openid: openid, date: today, model })
      .get();
    const usedCount = quotaRes.data.length > 0 ? quotaRes.data[0].usedCount : 0;
    const remaining = Math.max(0, freeQuota - usedCount);
    const exceeded = freeQuota > 0 && usedCount >= freeQuota;

    return {
      success: true,
      freeQuota,
      usedCount,
      remaining,
      exceeded,
      pricePerUse: config.pricePerUse || 0,
    };
  } catch (err) {
    console.error('[checkQuota] 失败', err);
    return { success: false, msg: err.message || '检查额度失败' };
  }
}

/**
 * 记录一次使用（增加使用次数）
 * @param {Object} event - { model }
 */
async function useQuota(event) {
  const { model } = event;
  const db = cloud.database();
  const _ = db.command;
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  const today = getTodayStr();

  try {
    // 查询是否已有今天的记录
    const existing = await db.collection('ai_quotas')
      .where({ _openid: openid, date: today, model })
      .get();

    if (existing.data && existing.data.length > 0) {
      // 更新次数
      await db.collection('ai_quotas').doc(existing.data[0]._id).update({
        data: { usedCount: _.inc(1) }
      });
    } else {
      // 新建记录
      await db.collection('ai_quotas').add({
        data: {
          _openid: openid,
          date: today,
          model,
          usedCount: 1,
          createdAt: db.serverDate(),
        }
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[useQuota] 失败', err);
    return { success: false, msg: err.message || '记录使用失败' };
  }
}

// ==================== 余额管理 ====================

/**
 * 获取用户余额
 * @param {Object} event - {}
 */
async function getUserBalance(event) {
  const db = cloud.database();
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;

  try {
    const res = await db.collection('users')
      .where({ _openid: openid })
      .field({ balance: true })
      .get();

    const balance = res.data[0]?.balance || 0;
    return { success: true, balance };
  } catch (err) {
    console.error('[getUserBalance] 失败', err);
    return { success: false, msg: err.message || '获取余额失败' };
  }
}

/**
 * 充值
 * @param {Object} event - { amount, gift, actualPay }
 */
async function recharge(event) {
  const { amount, gift = 0, actualPay } = event;
  const db = cloud.database();
  const _ = db.command;
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;

  if (!amount || amount <= 0) {
    return { success: false, msg: '充值金额无效' };
  }

  const totalAmount = amount + gift;

  try {
    // 更新用户余额
    await db.collection('users').where({ _openid: openid }).update({
      data: { balance: _.inc(totalAmount) }
    });

    // 查询最新余额
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .field({ balance: true })
      .get();
    const balanceAfter = userRes.data[0]?.balance || totalAmount;

    // 记录流水
    await db.collection('balance_logs').add({
      data: {
        _openid: openid,
        type: 'recharge',
        amount: totalAmount,
        actualPay: actualPay || amount,
        gift,
        balanceAfter,
        description: `充值${amount}元${gift > 0 ? '，送' + gift + '元' : ''}`,
        createdAt: db.serverDate(),
      }
    });

    return { success: true, balance: balanceAfter, msg: '充值成功' };
  } catch (err) {
    console.error('[recharge] 失败', err);
    return { success: false, msg: err.message || '充值失败' };
  }
}

/**
 * 扣费
 * @param {Object} event - { amount, description }
 */
async function deductBalance(event) {
  const { amount, description = '消费扣费' } = event;
  const db = cloud.database();
  const _ = db.command;
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;

  if (!amount || amount <= 0) {
    return { success: false, msg: '扣费金额无效' };
  }

  try {
    // 检查余额是否充足
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .field({ balance: true })
      .get();
    const currentBalance = userRes.data[0]?.balance || 0;

    if (currentBalance < amount) {
      return { success: false, msg: '余额不足，请先充值', balance: currentBalance };
    }

    // 扣减余额
    await db.collection('users').where({ _openid: openid }).update({
      data: { balance: _.inc(-amount) }
    });

    const balanceAfter = currentBalance - amount;

    // 记录流水
    await db.collection('balance_logs').add({
      data: {
        _openid: openid,
        type: 'deduct',
        amount: -amount,
        balanceAfter,
        description,
        createdAt: db.serverDate(),
      }
    });

    return { success: true, balance: balanceAfter };
  } catch (err) {
    console.error('[deductBalance] 失败', err);
    return { success: false, msg: err.message || '扣费失败' };
  }
}

/**
 * 获取余额流水记录
 * @param {Object} event - { page, pageSize }
 */
async function getBalanceLogs(event) {
  const { page = 1, pageSize = 20 } = event;
  const db = cloud.database();
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;

  try {
    const res = await db.collection('balance_logs')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('[getBalanceLogs] 失败', err);
    return { success: false, msg: err.message || '获取流水失败' };
  }
}

// ==================== 初始化 API 配置 ====================

/**
 * 初始化 API 配置（首次使用时调用，创建三条预设记录）
 */
async function initApiConfigs() {
  const db = cloud.database();

  const presets = [
    {
      category: 'image',
      provider: 'siliconflow',
      model: 'Kwai-Kolors/Kolors',
      modelName: '快手 Kolors',
      tier: 'low',
      apiKey: '',
      enabled: true,
      dailyFreeQuota: 5,
      pricePerUse: 0.01,
    },
    {
      category: 'image',
      provider: 'siliconflow',
      model: 'Qwen/Qwen-Image-Edit-2509',
      modelName: '通义千问',
      tier: 'medium',
      apiKey: '',
      enabled: true,
      dailyFreeQuota: 0,
      pricePerUse: 0.50,
    },
    {
      category: 'image',
      provider: 'siliconflow',
      model: 'stabilityai/stable-diffusion-xl-base-1.0',
      modelName: 'SDXL (高清)',
      tier: 'high',
      apiKey: '',
      enabled: true,
      dailyFreeQuota: 0,
      pricePerUse: 1.00,
    },
    {
      category: 'analysis',
      provider: 'xiaomi',
      model: 'mimo-v2.5-pro',
      modelName: 'MiMo 智能分析',
      tier: 'high',
      apiKey: '',
      enabled: true,
      dailyFreeQuota: 0,
      pricePerUse: 0,
    },
    {
      category: 'analysis',
      provider: 'xiaomi',
      model: 'mimo-v2.5',
      modelName: 'MiMo 分析（备用）',
      tier: 'medium',
      apiKey: '',
      enabled: true,
      dailyFreeQuota: 0,
      pricePerUse: 0,
    },
  ];

  try {
    // 先清理重复条目：同一个 model 只保留一条（取最早的那条）
    const allConfigs = await db.collection('api_configs').get();
    const seen = {};
    const duplicates = [];
    for (const item of (allConfigs.data || [])) {
      const key = item.model;
      if (seen[key]) {
        duplicates.push(item._id);
      } else {
        seen[key] = true;
      }
    }
    for (const id of duplicates) {
      await db.collection('api_configs').doc(id).remove();
    }

    // 检查每个预设模型是否存在，不存在则创建
    let created = 0;
    for (const preset of presets) {
      const existing = await db.collection('api_configs').where({ model: preset.model }).get();
      if (!existing.data || existing.data.length === 0) {
        await db.collection('api_configs').add({
          data: { ...preset, createdAt: db.serverDate(), updatedAt: db.serverDate() }
        });
        created++;
      }
    }

    return { success: true, msg: `初始化完成，清理 ${duplicates.length} 条重复，新增 ${created} 条` };
  } catch (err) {
    console.error('[initApiConfigs] 失败', err);
    return { success: false, msg: err.message || '初始化失败' };
  }
}

// ===== 临时：为小白插入测试健康数据 =====
async function insertTestHealth(event) {
  const { petId } = event;
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  const ownerId = wxContext.OPENID;

  if (!petId) return { success: false, msg: '缺少 petId' };

  const records = [
    // 体重（近2个月）
    { type: 'weight', value: '4.2', record_date: new Date('2026-04-15'), note: '刚到家体重' },
    { type: 'weight', value: '4.3', record_date: new Date('2026-04-28'), note: '' },
    { type: 'weight', value: '4.1', record_date: new Date('2026-05-05'), note: '有点瘦了' },
    { type: 'weight', value: '4.4', record_date: new Date('2026-05-15'), note: '长胖了一点' },
    { type: 'weight', value: '4.6', record_date: new Date('2026-05-25'), note: '' },
    { type: 'weight', value: '4.5', record_date: new Date('2026-06-02'), note: '控制饮食' },
    { type: 'weight', value: '4.9', record_date: new Date('2026-06-10'), note: '' },
    { type: 'weight', value: '5.0', record_date: new Date('2026-06-11'), note: '稍微胖了' },
    // 疫苗
    { type: 'vaccine', value: '猫三联', vaccine_name: '猫三联', institution: '爱宠宠物医院', record_date: new Date('2026-04-20'), note: '首次接种' },
    { type: 'vaccine', value: '狂犬疫苗', vaccine_name: '狂犬疫苗', institution: '爱宠宠物医院', record_date: new Date('2026-05-10'), note: '' },
    { type: 'vaccine', value: '猫三联(加强)', vaccine_name: '猫三联', institution: '爱宠宠物医院', record_date: new Date('2026-06-08'), note: '第二针加强' },
    // 驱虫
    { type: 'deworming', value: '大宠爱', medicine_name: '大宠爱', record_date: new Date('2026-04-25'), note: '体外驱虫' },
    { type: 'deworming', value: '拜耳内虫逃', medicine_name: '拜耳内虫逃', record_date: new Date('2026-05-12'), note: '体内驱虫' },
    { type: 'deworming', value: '大宠爱', medicine_name: '大宠爱', record_date: new Date('2026-06-05'), note: '体外驱虫' },
    // 体检
    { type: 'checkup', value: '常规体检', result: '健康状态良好，牙齿正常，耳朵干净', institution: '爱宠宠物医院', record_date: new Date('2026-04-20'), note: '首次体检' },
    // 饮食
    { type: 'food', value: '猫粮50g+冻干', food_intake: '皇家K36幼猫粮50g/天，偶尔喂鸡胸肉冻干', record_date: new Date('2026-05-01'), note: '' },
    { type: 'food', value: '猫粮55g+罐头', food_intake: '皇家K36幼猫粮55g/天，每周2次主食罐头', record_date: new Date('2026-06-01'), note: '增加食量' },
  ];

  let count = 0;
  for (const r of records) {
    await db.collection('health_records').add({
      data: {
        pet_id: petId,
        ownerId,
        recorder_role: 'owner',
        ...r,
      },
    });
    count++;
  }
  return { success: true, msg: `成功插入 ${count} 条健康记录` };
}

/**
 * 智能匹配：AI 解析用户自然语言需求为结构化 JSON
 * 输入: { userText: string, petInfo: { name, species, age, breed } }
 * 输出: { serviceCategory, keywords, budget, duration, preferences, petType, urgency }
 */
async function smartMatchParse(event) {
  const { userText = '', petInfo = {} } = event;
  const trimmedText = (userText || '').slice(0, 500);

  try {
    const systemPrompt = `你是宠物服务需求分析助手。请分析用户需求并返回一个JSON对象，不要返回其他任何文字。

宠物信息：${JSON.stringify(petInfo)}
用户需求：${trimmedText || '请根据宠物信息推荐'}

示例输入："我家小狗有点胆小，在黑龙江，找100元以内的寄养"
示例输出：{"serviceCategory":"foster","keywords":["寄养","小狗","胆小","黑龙江","100元"],"budget":{"min":null,"max":100},"preferences":["安静","胆小"],"urgency":"normal","location":"黑龙江"}

示例输入："猫咪洗澡，要干净的店"
示例输出：{"serviceCategory":"grooming","keywords":["洗澡","猫咪","干净"],"budget":null,"preferences":["干净"],"urgency":"normal","location":null}

示例输入："我家小狗有点饿，整点吃的"
示例输出：{"serviceCategory":"extra","keywords":["狗粮","零食","吃的","小狗"],"budget":null,"preferences":[],"urgency":"normal","location":null}

keywords提取5-8个，包括服务类型、宠物特征、地点、价格等关键词
preferences提取用户隐含偏好（如胆小→安静，有监控→安全）
serviceCategory：foster寄养 grooming美容 medical医疗 door上门 extra商品增值 null不限
urgency：normal或urgent
location：用户提到的城市/省份名，没有则为null`;

    const apiResult = await callAnalysisAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: trimmedText || '请根据宠物信息推荐' },
    ], { temperature: 0.3, max_tokens: 2000 });

    if (!apiResult.success || !apiResult.content) {
      console.warn('[smartMatchParse] AI 调用失败，使用规则降级:', apiResult.msg);
      return fallbackSmartMatch(trimmedText, petInfo);
    }

    const content = apiResult.content || '';

    function extractJson(text) {
      if (!text) return null;
      const results = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        for (let j = i; j < text.length; j++) {
          if (text[j] === '{') depth++;
          if (text[j] === '}') depth--;
          if (depth === 0) {
            const candidate = text.slice(i, j + 1);
            try {
              const obj = JSON.parse(candidate);
              if (obj && obj.serviceCategory !== undefined) results.push(obj);
            } catch (e) { /* 跳过 */ }
            break;
          }
        }
      }
      return results.length > 0 ? results[results.length - 1] : null;
    }

    const parsed = extractJson(content);
    if (parsed) {
      return { success: true, parsed };
    }

    return { success: false, msg: 'AI 返回格式异常: ' + content.slice(0, 300) };
  } catch (e) {
    console.error('[smartMatchParse] 异常，使用规则降级:', e.message);
    return fallbackSmartMatch((event.userText || '').slice(0, 500), event.petInfo || {});
  }
}

/**
 * 规则降级：AI 失败时基于关键词提取需求
 */
function fallbackSmartMatch(userText, petInfo) {
  const text = (userText || '').toLowerCase();
  const keywords = [];
  const preferences = [];
  let serviceCategory = null;
  let budget = null;
  let location = null;
  let urgency = 'normal';

  // 服务类型识别
  if (/寄养|托管|出差|旅行|放家里没人/.test(text)) {
    serviceCategory = 'foster';
    keywords.push('寄养');
  } else if (/洗澡|美容|剪毛|造型|修剪/.test(text)) {
    serviceCategory = 'grooming';
    keywords.push('美容');
  } else if (/看病|医疗|生病|打针|体检|疫苗|绝育/.test(text)) {
    serviceCategory = 'medical';
    keywords.push('医疗');
  } else if (/上门|到家|送上门/.test(text)) {
    serviceCategory = 'door';
    keywords.push('上门服务');
  } else if (/狗粮|猫粮|零食|吃的|用品|玩具/.test(text)) {
    serviceCategory = 'extra';
    keywords.push('商品');
  }

  // 宠物类型
  if (/猫|喵/.test(text)) keywords.push('猫');
  if (/狗|犬|汪/.test(text)) keywords.push('狗');
  if (petInfo.species) keywords.push(petInfo.species);
  if (petInfo.name) keywords.push(petInfo.name);

  // 偏好提取
  if (/安静|胆小|怕生|内向/.test(text)) { preferences.push('安静'); keywords.push('安静'); }
  if (/监控|摄像头|24小时/.test(text)) { preferences.push('监控'); keywords.push('监控'); }
  if (/干净|卫生|消毒/.test(text)) { preferences.push('干净'); keywords.push('干净'); }
  if (/便宜|实惠|省钱|性价比/.test(text)) { preferences.push('实惠'); keywords.push('实惠'); }
  if (/近|附近|旁边|就近/.test(text)) { keywords.push('附近'); }
  if (/好|优质|专业|靠谱/.test(text)) { preferences.push('优质'); }

  // 预算提取
  const budgetMatch = text.match(/(\d+)\s*元/);
  if (budgetMatch) {
    const maxBudget = parseInt(budgetMatch[1]);
    budget = { min: null, max: maxBudget };
    keywords.push(maxBudget + '元');
  }

  // 地点提取
  const provinces = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','台湾','内蒙古','广西','西藏','宁夏','新疆'];
  const cities = ['北京','天津','上海','重庆','石家庄','唐山','保定','邯郸','太原','大同','临汾','沈阳','大连','鞍山','长春','吉林','哈尔滨','齐齐哈尔','大庆','牡丹江','南京','苏州','无锡','常州','杭州','宁波','温州','合肥','芜湖','马鞍山','福州','厦门','泉州','南昌','赣州','九江','济南','青岛','烟台','郑州','洛阳','开封','武汉','宜昌','襄阳','长沙','株洲','湘潭','广州','深圳','东莞','佛山','海口','三亚','成都','绵阳','德阳','贵阳','遵义','昆明','大理','丽江','西安','咸阳','宝鸡','兰州','天水','西宁','台北','高雄','呼和浩特','包头','南宁','柳州','桂林','拉萨','银川','乌鲁木齐','伊宁'];
  for (const city of [...cities, ...provinces]) {
    if (text.includes(city)) {
      location = city;
      keywords.push(city);
      break;
    }
  }

  // 紧急度
  if (/急|马上|今天|立刻|尽快|赶紧/.test(text)) {
    urgency = 'urgent';
    keywords.push('紧急');
  }

  // 确保有基础关键词
  if (keywords.length === 0) {
    keywords.push(petInfo.species || '宠物', '服务');
  }
  if (!serviceCategory) {
    keywords.push('服务');
  }

  return {
    success: true,
    parsed: {
      serviceCategory,
      keywords: [...new Set(keywords)].slice(0, 8),
      budget,
      duration: null,
      preferences: [...new Set(preferences)],
      petType: (petInfo.species || '').includes('猫') ? 'cat' : (petInfo.species || '').includes('狗') ? 'dog' : 'other',
      urgency,
      location,
    },
  };
}

/**
 * AI 健康风险预警
 * 分析宠物健康数据，识别异常指标和关键时间节点
 */
async function healthRiskAnalysis(event) {
  const { pet_info = {}, health_records = [] } = event;
  console.log('[healthRiskAnalysis] 开始分析, pet:', pet_info.name, 'records:', health_records.length);

  try {
    // 整理健康数据摘要
    const now = new Date();
    const records = health_records.slice(0, 30);

    const weightRecords = records.filter(r => r.type === 'weight').slice(0, 10);
    const vaccineRecords = records.filter(r => r.type === 'vaccine').slice(0, 5);
    const dewormingRecords = records.filter(r => r.type === 'deworming').slice(0, 5);
    const checkupRecords = records.filter(r => r.type === 'checkup').slice(0, 3);

    const dataSummary = {
      weight: weightRecords.map(r => `${r.value}kg(${r.createTime.slice(0, 10)})`).join(', ') || '无记录',
      vaccine: vaccineRecords.map(r => `${r.value}(${r.createTime.slice(0, 10)})`).join(', ') || '无记录',
      deworming: dewormingRecords.map(r => `${r.value}(${r.createTime.slice(0, 10)})`).join(', ') || '无记录',
      checkup: checkupRecords.map(r => `${r.value}(${r.createTime.slice(0, 10)})`).join(', ') || '无记录',
    };

    const systemPrompt = `你是宠物健康风险分析专家。根据宠物信息和健康记录分析风险，返回JSON。

宠物：品种${pet_info.species || '未知'}，年龄${pet_info.age || '未知'}岁
体重记录：${dataSummary.weight}
疫苗记录：${dataSummary.vaccine}
驱虫记录：${dataSummary.deworming}
体检记录：${dataSummary.checkup}
今天：${now.toISOString().slice(0, 10)}

示例输出：{"risks":[{"level":"high","type":"疫苗到期","title":"狂犬疫苗已过期","desc":"上次接种于2026-01-10，已过152天，请尽快补种"}],"summary":"疫苗已过期需尽快处理"}

示例输出：{"risks":[],"summary":"各项指标正常，健康状况良好"}

level只能是high、warning或info
最多5条风险，没有风险时risks为空数组`;

    const apiResult = await callAnalysisAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请分析这只宠物的健康风险' },
    ], { temperature: 0.3, max_tokens: 1500, timeout: 30000 });

    console.log('[healthRiskAnalysis] API 结果:', apiResult.success, apiResult.msg || 'ok');

    if (!apiResult.success || !apiResult.content) {
      console.warn('[healthRiskAnalysis] API 失败，使用规则降级:', apiResult.msg);
      return fallbackRiskAnalysis(pet_info, health_records);
    }

    const raw = apiResult.content;

    // 提取 JSON
    function extractJson(text) {
      if (!text) return null;
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        for (let j = i; j < text.length; j++) {
          if (text[j] === '{') depth++;
          if (text[j] === '}') depth--;
          if (depth === 0) {
            try {
              const obj = JSON.parse(text.slice(i, j + 1));
              if (obj && obj.risks !== undefined) return obj;
            } catch (e) { /* 跳过 */ }
            break;
          }
        }
      }
      return null;
    }

    const parsed = extractJson(raw);
    if (parsed) {
      return { success: true, risks: parsed.risks || [], summary: parsed.summary || '' };
    }

    return fallbackRiskAnalysis(pet_info, health_records);
  } catch (e) {
    console.error('[healthRiskAnalysis] 异常:', e.message, e.stack);
    return fallbackRiskAnalysis(pet_info, health_records);
  }
}

/**
 * 规则降级：AI 失败时基于规则生成风险提示
 */
function fallbackRiskAnalysis(petInfo, records) {
  const risks = [];
  const now = new Date();

  // 疫苗到期检查（3个月周期）
  const vaccines = records.filter(r => r.type === 'vaccine');
  if (vaccines.length > 0) {
    const latest = vaccines[0];
    const lastDate = new Date(latest.createTime);
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    if (daysSince > 120) {
      risks.push({ level: 'high', type: '疫苗到期', title: `${latest.value}已超期`, desc: `上次接种于${latest.createTime.slice(0, 10)}，已过${daysSince}天，建议尽快补种`, action: '预约接种' });
    } else if (daysSince > 80) {
      risks.push({ level: 'warning', type: '疫苗提醒', title: `${latest.value}即将到期`, desc: `上次接种于${latest.createTime.slice(0, 10)}，还有约${120 - daysSince}天到期` });
    }
  }

  // 驱虫到期检查（1个月周期）
  const dewormings = records.filter(r => r.type === 'deworming');
  if (dewormings.length > 0) {
    const latest = dewormings[0];
    const lastDate = new Date(latest.createTime);
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    if (daysSince > 45) {
      risks.push({ level: 'warning', type: '驱虫提醒', title: `${latest.value}已超期`, desc: `上次驱虫于${latest.createTime.slice(0, 10)}，已过${daysSince}天，建议尽快驱虫` });
    }
  }

  // 体重骤变检查
  const weights = records.filter(r => r.type === 'weight');
  if (weights.length >= 2) {
    const latest = Number(weights[0].value) || 0;
    const prev = Number(weights[1].value) || 0;
    if (prev > 0) {
      const change = Math.abs(latest - prev) / prev;
      if (change > 0.2) {
        risks.push({ level: 'high', type: '体重骤变', title: '体重变化超过20%', desc: `近期体重从${prev}kg变为${latest}kg，变化${(change * 100).toFixed(0)}%，建议就医检查` });
      } else if (change > 0.1) {
        risks.push({ level: 'warning', type: '体重波动', title: '体重有明显变化', desc: `近期体重从${prev}kg变为${latest}kg，变化${(change * 100).toFixed(0)}%，建议关注饮食` });
      }
    }
  }

  const summary = risks.length === 0 ? '目前未发现明显健康风险，继续保持良好习惯' :
    risks.some(r => r.level === 'high') ? '发现需要关注的健康问题，建议及时处理' :
    '有需要关注的事项，建议留意观察';

  return { success: true, risks, summary };
}

/**
 * 宠物服务个性化定制
 * 根据宠物信息和健康记录，生成个性化寄养方案
 * 输入: { pet_info: { name, species, age, character, special_needs }, health_records: [] }
 * 输出: { success, plan: { diet, services, careTips, summary } }
 */
async function petServiceCustomize(event) {
  const { pet_info = {}, health_records = [] } = event;

  try {
    // 整理健康记录摘要
    const records = health_records.slice(0, 20);
    const weightRecords = records.filter(r => r.type === 'weight').slice(0, 5);
    const vaccineRecords = records.filter(r => r.type === 'vaccine').slice(0, 3);
    const checkupRecords = records.filter(r => r.type === 'checkup').slice(0, 2);
    const foodRecords = records.filter(r => r.type === 'food').slice(0, 3);

    const healthSummary = [
      weightRecords.length > 0 ? `体重记录：${weightRecords.map(r => `${r.value}kg(${r.createTime ? r.createTime.slice(0, 10) : '未知'})`).join(', ')}` : '',
      vaccineRecords.length > 0 ? `疫苗记录：${vaccineRecords.map(r => `${r.value || r.vaccine_name}(${r.createTime ? r.createTime.slice(0, 10) : '未知'})`).join(', ')}` : '',
      checkupRecords.length > 0 ? `体检记录：${checkupRecords.map(r => `${r.result || r.value}(${r.createTime ? r.createTime.slice(0, 10) : '未知'})`).join(', ')}` : '',
      foodRecords.length > 0 ? `饮食记录：${foodRecords.map(r => `${r.food_intake || r.value}(${r.createTime ? r.createTime.slice(0, 10) : '未知'})`).join(', ')}` : '',
    ].filter(Boolean).join('\n') || '暂无健康记录';

    const systemPrompt = `你是一位专业的宠物寄养顾问。请根据宠物信息和健康记录，为这只宠物定制个性化的寄养服务方案。只返回JSON，不要返回其他文字。

宠物信息：
- 名字：${pet_info.name || '未知'}
- 品种：${pet_info.species || '未知'}
- 年龄：${pet_info.age || '未知'}岁
- 性格：${pet_info.character || '未知'}
- 特殊需求：${pet_info.special_needs || '无'}

健康记录摘要：
${healthSummary}

请返回JSON对象，字段如下：
- diet: 特殊饮食建议（字符串，50字以内）
- services: 推荐的额外服务数组（如"安静单间"、"额外陪伴"、"定时喂药"、"24小时监控"等，3-5项）
- careTips: 护理注意事项数组（2-4项）
- summary: 方案总体描述（字符串，60字以内）

示例输出：
{"diet":"建议选择低敏配方粮，每日定量喂食","services":["安静单间","额外陪伴","24小时监控"],"careTips":["避免与其他大型犬接触","每日早晚遛弯"],"summary":"该宠物性格较胆小，建议安排安静单间并增加陪伴时间"}`;

    const apiResult = await callAnalysisAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请为这只宠物定制个性化寄养方案' },
    ], { temperature: 0.4, max_tokens: 1500 });

    if (!apiResult.success || !apiResult.content) {
      return fallbackServicePlan(pet_info, health_records);
    }

    const raw = apiResult.content;

    // 提取 JSON
    function extractJson(text) {
      if (!text) return null;
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        for (let j = i; j < text.length; j++) {
          if (text[j] === '{') depth++;
          if (text[j] === '}') depth--;
          if (depth === 0) {
            try {
              const obj = JSON.parse(text.slice(i, j + 1));
              if (obj && obj.diet !== undefined) return obj;
            } catch (e) { /* 跳过 */ }
            break;
          }
        }
      }
      return null;
    }

    const parsed = extractJson(raw);
    if (parsed) {
      return {
        success: true,
        plan: {
          diet: parsed.diet || '',
          services: Array.isArray(parsed.services) ? parsed.services : [],
          careTips: Array.isArray(parsed.careTips) ? parsed.careTips : [],
          summary: parsed.summary || '',
        },
      };
    }

    return fallbackServicePlan(pet_info, health_records);
  } catch (e) {
    console.error('[petServiceCustomize]', e.message);
    return fallbackServicePlan(pet_info, health_records);
  }
}

/**
 * 规则降级：AI 失败时基于规则生成个性化寄养方案
 */
function fallbackServicePlan(petInfo, records) {
  const services = [];
  const careTips = [];
  let diet = '保持日常饮食习惯即可';

  const special = (petInfo.special_needs || '').toLowerCase();
  const character = (petInfo.character || '').toLowerCase();

  if (special.includes('胆小') || special.includes('怕生') || character.includes('胆小') || character.includes('内向')) {
    services.push('安静单间');
    services.push('额外陪伴');
    careTips.push('避免与其他活泼宠物同笼');
  }
  if (special.includes('吃药') || special.includes('喂药') || special.includes('疾病') || special.includes('慢病')) {
    services.push('定时喂药');
    services.push('24小时监控');
    careTips.push('按时记录用药情况');
  }
  if (special.includes('挑食') || special.includes('过敏') || special.includes('肠胃')) {
    diet = '建议自带专用粮，避免换粮引起肠胃不适';
    services.push('单独喂食');
    careTips.push('严格按照主人要求喂食');
  }
  if (special.includes('老年') || (petInfo.age && petInfo.age > 8)) {
    services.push('软垫休息区');
    services.push('减少剧烈运动');
    careTips.push('注意保暖，避免受凉');
  }
  if (services.length === 0) {
    services.push('标准寄养服务');
    services.push('每日活动');
    careTips.push('保持日常作息规律');
  }

  const summary = `根据${petInfo.name || '该宠物'}的特点，推荐${services.slice(0, 2).join('、')}等定制服务。`;

  return {
    success: true,
    plan: { diet, services, careTips, summary },
  };
}

/**
 * 批量更新模型价格和免费额度
 * 调用方式: wx.cloud.callFunction({ name: 'ai_handler', data: { action: 'update_model_prices' } })
 */
async function updateModelPrices() {
  const db = cloud.database();

  try {
    const res = await db.collection('api_configs').get();
    const configs = res.data || [];

    const updates = configs.map(item => {
      let newPrice = item.pricePerUse;
      let newQuota = item.dailyFreeQuota;

      // SDXL 改为 1 元/次
      if (item.model && item.model.toLowerCase().includes('sdxl')) {
        newPrice = 1;
      }

      // 所有模型：免费额度用完后必须付费（保持现有免费额度不变，确保 pricePerUse > 0）
      if (!newPrice || newPrice <= 0) {
        newPrice = 0.1; // 默认最低付费价格
      }

      // 仅当价格或额度有变化时才更新
      if (newPrice !== item.pricePerUse || newQuota !== item.dailyFreeQuota) {
        return db.collection('api_configs').doc(item._id).update({
          data: {
            pricePerUse: newPrice,
            dailyFreeQuota: newQuota,
          },
        });
      }
      return null;
    }).filter(Boolean);

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return {
      success: true,
      msg: `已更新 ${updates.length} 个模型配置`,
      details: configs.map(c => ({
        model: c.model,
        modelName: c.modelName,
        pricePerUse: c.model && c.model.toLowerCase().includes('sdxl') ? 1 : c.pricePerUse,
        dailyFreeQuota: c.dailyFreeQuota,
      })),
    };
  } catch (err) {
    console.error('[updateModelPrices]', err.message);
    return { success: false, msg: err.message || '更新失败' };
  }
}

/**
 * 清理 api_configs 中的重复条目（同一 model 只保留最早的一条）
 */
async function cleanupDuplicateConfigs() {
  const db = cloud.database();

  try {
    const all = await db.collection('api_configs').get();
    const configs = all.data || [];

    // 按 model 分组
    const groups = {};
    for (const item of configs) {
      const key = item.model;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    let removed = 0;
    for (const key in groups) {
      if (groups[key].length > 1) {
        // 按创建时间排序，保留第一条，删除其余
        const sorted = groups[key].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ta - tb;
        });
        for (let i = 1; i < sorted.length; i++) {
          await db.collection('api_configs').doc(sorted[i]._id).remove();
          removed++;
        }
      }
    }

    return { success: true, msg: `清理完成，删除 ${removed} 条重复配置` };
  } catch (err) {
    console.error('[cleanupDuplicateConfigs]', err.message);
    return { success: false, msg: err.message || '清理失败' };
  }
}
