# 智能匹配功能设计文档

## 1. 概述

用户输入自然语言描述宠物需求，系统通过 AI 理解意图后，从所有机构和服务中推荐最匹配的方案。

**核心流程**：用户输入 → AI 意图解析 → 本地加权评分 → 推荐结果列表

**技术方案**：云端 AI 解析 + 本地匹配评分（方案 A）

**AI 模型**：mimo-v2.5-pro（通过云函数调用）

## 2. 入口位置

首页新增"智能匹配"入口卡片，位于推荐机构区域上方。

```
┌─────────────────────────────┐
│  🤖 智能匹配                │
│  描述需求，为你推荐最合适的服务 │
│  [ 立即匹配 → ]             │
└─────────────────────────────┘
```

## 3. 页面结构

### 3.1 匹配输入页

```
┌─────────────────────────────┐
│  ← 智能匹配                 │
├─────────────────────────────┤
│                             │
│  选择宠物                    │
│  ┌─────────────────────────┐│
│  │ 🐱 小白 · 猫咪 · 3岁    ││
│  └─────────────────────────┘│
│                             │
│  描述你的需求                 │
│  ┌─────────────────────────┐│
│  │                         ││
│  │ 我出差3天，需要寄养小白， ││
│  │ 要干净安静的环境，有监控  ││
│  │                         ││
│  └─────────────────────────┘│
│  💡 试试："附近可以寄养猫咪  ││
│     的地方，价格实惠一点"     │
│                             │
│  [ 🔍 智能匹配 ]             │
└─────────────────────────────┘
```

**交互说明**：
- 宠物选择：下拉选择用户档案中的宠物，自动带入品种、年龄等信息
- 需求输入：textarea，placeholder 显示示例文案
- 不填文字也能匹配：仅根据宠物信息（品种、年龄）推荐通用服务

### 3.2 推荐结果页

```
┌─────────────────────────────┐
│  ← 匹配结果                 │
├─────────────────────────────┤
│  为你找到 3 个匹配方案         │
│                             │
│  ┌─ 匹配度 95% ────────────┐│
│  │ 🏠 爱宠之家              ││
│  │ 📍 距你 1.2km · 宠物寄养  ││
│  │ 🐱 猫咪日托寄养 ¥35/天   ││
│  │ 💬 "环境安静，有24h监控"  ││
│  │ [查看详情] [立即预约]     ││
│  └─────────────────────────┘│
│                             │
│  ┌─ 匹配度 82% ────────────┐│
│  │ 🏠 萌宠乐园              ││
│  │ 📍 距你 3.5km · 综合服务  ││
│  │ 🐱 猫咪长期寄宿 ¥30/天   ││
│  │ 💬 "24小时看护，有摄像头" ││
│  │ [查看详情] [立即预约]     ││
│  └─────────────────────────┘│
│                             │
│  ┌─ 匹配度 68% ────────────┐│
│  │ ...                     ││
│  └─────────────────────────┘│
│                             │
│  [🔄 重新匹配]               │
└─────────────────────────────┘
```

**结果卡片信息**：
- 匹配度百分比（带颜色条：90%+ 绿色，70-89% 橙色，<70% 灰色）
- 机构名称 + 类型标签
- 距离（调用 `wx.getLocation` 计算）
- 匹配到的具体服务名称 + 价格
- AI 生成的匹配理由（一句话）
- 操作按钮：查看详情 / 立即预约

## 4. AI 意图解析

### 4.1 云函数 action：`smart_match_parse`

**输入**：
```json
{
  "action": "smart_match_parse",
  "userText": "我出差3天，需要寄养小白，要干净安静的环境，有监控",
  "petInfo": { "name": "小白", "species": "猫", "age": "3岁", "breed": "英短" }
}
```

**AI Prompt**：
```
你是一个宠物服务需求分析助手。根据用户描述和宠物信息，提取结构化的服务需求。

宠物信息：{petInfo}
用户需求：{userText}

请返回 JSON 格式（不要包含其他文字）：
{
  "serviceCategory": "foster|grooming|medical|door|extra",
  "keywords": ["关键词1", "关键词2", ...],
  "budget": { "min": 数字或null, "max": 数字或null },
  "duration": "时长描述或null",
  "preferences": ["偏好1", "偏好2", ...],
  "petType": "cat|dog|other",
  "urgency": "normal|urgent"
}

规则：
- serviceCategory：foster=寄养, grooming=美容洗护, medical=医疗, door=上门服务, extra=商品增值
- keywords：提取 3-5 个核心关键词（名词/形容词），用于文本匹配
- budget：如果用户提到价格/预算/实惠等，提取范围；否则为 null
- preferences：用户的特殊偏好（如"安静"、"有监控"、"干净"），用于与机构描述匹配
- urgency：提到"急"、"马上"、"今天"等为 urgent，否则 normal
```

**输出**：AI 返回的结构化 JSON，前端直接使用。

### 4.2 模型配置

使用 mimo-v2.5-pro 模型。需要在 `api_configs` 集合中新增配置记录：

```json
{
  "category": "match",
  "provider": "siliconflow",
  "model": "mimo-v2.5-pro",
  "modelName": "MiMo 智能匹配",
  "tier": "low",
  "apiKey": "管理员在后台填入",
  "enabled": true,
  "dailyFreeQuota": 20,
  "pricePerUse": 0
}
```

云函数中调用逻辑：
```js
// 获取 AI 模型配置
const config = await db.collection('api_configs')
  .where({ model: 'mimo-v2.5-pro', enabled: true })
  .get();
const apiKey = config.data[0]?.apiKey;

// 调用 SiliconFlow API（mimo-v2.5-pro 托管平台）
const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
  model: 'mimo-v2.5-pro',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ],
  temperature: 0.3,
  max_tokens: 500,
}, { headers: { Authorization: `Bearer ${apiKey}` } });
```

## 5. 匹配评分算法

### 5.1 数据准备

查询所有已审核机构及其服务，构建 `(agency, service)` 对：

```js
const agencies = await db.collection('agency_profiles')
  .where({ auditStatus: 'approved' })
  .get();

const services = await db.collection('agency_services')
  .orderBy('createTime', 'desc')
  .limit(100)
  .get();

// 关联机构信息到服务
const pairs = services.data.map(s => {
  const agency = agencies.data.find(a => a._id === s.agencyProfileId);
  return { service: s, agency };
}).filter(p => p.agency); // 过滤掉无机构的服务
```

### 5.2 硬性过滤

```js
const filtered = pairs.filter(({ service, agency }) => {
  // 1. 服务类型必须匹配（如果 AI 解析出了类型）
  if (parsed.serviceCategory && service.category !== parsed.serviceCategory) return false;
  // 2. 机构必须已审核
  if (agency.auditStatus !== 'approved') return false;
  return true;
});
```

### 5.3 评分函数

```js
function calcScore({ service, agency }, parsed, userLocation) {
  let score = 5; // 基础分

  // 1. 服务类型匹配 (+25)
  if (parsed.serviceCategory && service.category === parsed.serviceCategory) {
    score += 25;
  }

  // 2. 关键词匹配 (+20)
  const textPool = [
    service.name, service.desc,
    agency.orgIntro, agency.serviceScope, agency.orgName
  ].join(' ').toLowerCase();

  const keywordHits = parsed.keywords.filter(kw => textPool.includes(kw.toLowerCase()));
  score += Math.min(keywordHits.length * 5, 20);

  // 3. 区域匹配 (+15)
  if (userLocation && agency.region) {
    const userRegion = userLocation.region || '';
    if (agency.region.includes(userRegion) || userRegion.includes(agency.region)) {
      score += 15;
    }
  }

  // 4. 价格匹配 (+15)
  if (parsed.budget && parsed.budget.max) {
    const price = Number(service.price) || 0;
    if (price >= (parsed.budget.min || 0) && price <= parsed.budget.max) {
      score += 15;
    } else if (price < (parsed.budget.min || 0)) {
      score += 10; // 低于预算也给部分分
    }
  }

  // 5. 环境展示度 (+10)
  if (agency.envImages && agency.envImages.length > 0) {
    score += 10;
  } else {
    score += 3;
  }

  // 6. 偏好匹配 (+10)
  if (parsed.preferences && parsed.preferences.length > 0) {
    const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
      .filter(Boolean).join(' ').toLowerCase();
    const prefHits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
    score += Math.min(prefHits.length * 5, 10);
  }

  // 7. 紧急度加成
  if (parsed.urgency === 'urgent') {
    // 紧急需求：有空闲笼位的寄养机构加分
    if (service.category === 'foster' && agency.totalCages > 0) {
      score += 5;
    }
  }

  return score;
}
```

### 5.4 排序与输出

```js
// 评分
const scored = filtered.map(p => ({
  ...p,
  matchScore: calcScore(p, parsed, userLocation),
}));

// 排序，过滤低分，取前 10
const results = scored
  .filter(r => r.matchScore >= 30)
  .sort((a, b) => b.matchScore - a.matchScore)
  .slice(0, 10);
```

### 5.5 评分维度汇总

| 维度 | 分值 | 数据来源 |
|------|------|---------|
| 基础分 | +5 | 所有已审核机构+服务 |
| 服务类型匹配 | +25 | AI 解析 `serviceCategory` vs `service.category` |
| 关键词匹配 | +20 | AI 提取 keywords vs 服务/机构文本 |
| 区域匹配 | +15 | 用户位置 vs `agency.region` |
| 价格匹配 | +15 | AI 解析 budget vs `service.price` |
| 环境展示度 | +10 | `agency.envImages` 数量 |
| 偏好匹配 | +10 | AI 解析 preferences vs 机构描述文本 |
| 紧急加成 | +5 | 紧急需求 + 寄养有笼位 |
| **总计** | **最高 105** | |

## 6. 新增/修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `pages/smart-match/smart-match.*` | **新建** | 智能匹配页面（wxml/js/less/json） |
| `pages/index/index.wxml` | 修改 | 首页新增"智能匹配"入口卡片 |
| `pages/index/index.js` | 修改 | 新增 `toSmartMatch()` 导航方法 |
| `pages/index/index.less` | 修改 | 入口卡片样式 |
| `cloudfunctions/ai_handler/index.js` | 修改 | 新增 `smart_match_parse` action |
| `app.json` | 修改 | 注册 `pages/smart-match/smart-match` |

## 7. 数据库集合依赖

- `agency_profiles`：机构信息（已有）
- `agency_services`：服务列表（已有）
- `api_configs`：AI 模型配置（已有，需确保有 mimo-v2.5-pro 或复用现有 deepseek-chat 模型）
- `pets`：用户宠物档案（已有，用于选择宠物）

无需新增数据库集合。

## 8. 验证方案

1. **入口验证**：首页显示"智能匹配"卡片，点击进入匹配页
2. **宠物选择**：下拉列表显示当前用户的宠物档案
3. **AI 解析验证**：输入"我家猫需要寄养3天" → 检查云函数返回的 JSON 是否正确解析出 `serviceCategory: "foster"`
4. **评分验证**：检查推荐结果是否按分数排序，高匹配度的排在前面
5. **结果展示**：卡片显示机构信息、服务信息、匹配度百分比
6. **操作跳转**："查看详情"跳转机构详情页，"立即预约"跳转服务下单页
7. **空结果处理**：无匹配时显示"暂无合适推荐，试试其他描述"
