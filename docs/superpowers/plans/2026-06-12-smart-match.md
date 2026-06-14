# Smart Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AI-powered natural language smart matching — users describe pet needs in free text, AI parses intent, local scoring recommends best-matching agencies/services.

**Architecture:** Rewrite existing `pages/smart-match/smart-match.*` from structured filters to two-phase approach: (1) Cloud function `smart_match_parse` calls mimo-v2.5-pro to extract structured intent from natural language, (2) Client-side weighted scoring across 7 dimensions (max 105 points) ranks `(agency, service)` pairs.

**Tech Stack:** WeChat Mini Program, cloud functions, Vant Weapp, Canvas (for match score visualization), Less styles, SiliconFlow API (mimo-v2.5-pro)

---

## File Map

| File | Operation | Responsibility |
|------|-----------|---------------|
| `pages/smart-match/smart-match.js` | **Rewrite** | Pet selector, AI parse call, scoring, results |
| `pages/smart-match/smart-match.wxml` | **Rewrite** | Input page + results list UI |
| `pages/smart-match/smart-match.less` | **Rewrite** | Styles for input/results |
| `pages/smart-match/smart-match.json` | **Modify** | Add van-picker component |
| `cloudfunctions/ai_handler/index.js` | **Modify** | Add `smart_match_parse` action + `smartMatchParse` function |
| `pages/index/index.wxml` | Already done | Homepage entry card exists |
| `pages/index/index.js` | Already done | `toSmartMatch()` exists |
| `app.json` | Already done | Page registered |

---

## Task 1: Cloud Function — `smart_match_parse` Action

**Files:**
- Modify: `cloudfunctions/ai_handler/index.js`

- [ ] **Step 1: Add case to switch statement**

In `cloudfunctions/ai_handler/index.js`, add a new case in the `switch (action)` block, after the existing `insert_test_health` case (line 63):

```js
    case 'smart_match_parse':
      return await smartMatchParse(event);
```

- [ ] **Step 2: Implement `smartMatchParse` function**

Add the following function at the end of the file (before the closing `}` of the last function, or after `insertTestHealth`):

```js
/**
 * 智能匹配：AI 解析用户自然语言需求为结构化 JSON
 * 输入: { userText: string, petInfo: { name, species, age, breed } }
 * 输出: { serviceCategory, keywords, budget, duration, preferences, petType, urgency }
 */
async function smartMatchParse(event) {
  const { userText = '', petInfo = {} } = event;
  const db = cloud.database();

  // 获取 mimo-v2.5-pro 模型配置
  const configRes = await db.collection('api_configs')
    .where({ model: 'mimo-v2.5-pro', enabled: true })
    .get();
  const apiKey = configRes.data[0]?.apiKey;
  if (!apiKey) {
    return { success: false, msg: 'AI 模型未配置' };
  }

  const systemPrompt = `你是一个宠物服务需求分析助手。根据用户描述和宠物信息，提取结构化的服务需求。

宠物信息：${JSON.stringify(petInfo)}
用户需求：${userText || '(用户未填写文字需求，请仅根据宠物信息推荐)'}

请返回 JSON 格式（不要包含其他文字）：
{
  "serviceCategory": "foster|grooming|medical|door|extra|null",
  "keywords": ["关键词1", "关键词2", ...],
  "budget": { "min": 数字或null, "max": 数字或null },
  "duration": "时长描述或null",
  "preferences": ["偏好1", "偏好2", ...],
  "petType": "cat|dog|other",
  "urgency": "normal|urgent"
}

规则：
- serviceCategory：foster=寄养, grooming=美容洗护, medical=医疗, door=上门服务, extra=商品增值, null=不限
- keywords：提取 3-5 个核心关键词（名词/形容词），用于文本匹配
- budget：如果用户提到价格/预算/实惠等，提取范围；否则为 null
- preferences：用户的特殊偏好（如"安静"、"有监控"、"干净"），用于与机构描述匹配
- urgency：提到"急"、"马上"、"今天"等为 urgent，否则 normal`;

  try {
    const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'mimo-v2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText || '请根据宠物信息推荐服务' },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });

    const raw = res.data.choices[0].message.content;
    // 尝试提取 JSON（兼容 AI 可能返回 markdown 代码块的情况）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, msg: 'AI 返回格式异常' };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return { success: true, parsed };
  } catch (e) {
    console.warn('[smartMatchParse]', e.message);
    return { success: false, msg: 'AI 解析失败: ' + e.message };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add cloudfunctions/ai_handler/index.js
git commit -m "feat: add smart_match_parse cloud function action for AI intent parsing"
```

---

## Task 2: Smart Match Page — JS Logic (Rewrite)

**Files:**
- Rewrite: `pages/smart-match/smart-match.js`

- [ ] **Step 1: Replace entire file content**

Replace the entire `pages/smart-match/smart-match.js` with:

```js
// pages/smart-match/smart-match.js
const { CAT_TITLE_MAP, getStatusBarHeight } = require('../../utils/helpers');
const { resolveAgencyImages, resolveTempUrls } = require('../../utils/fileHelper');
const authService = require('../../services/authService');

const db = wx.cloud.database();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,

    // 宠物选择
    petList: [],
    selectedPetId: '',
    selectedPet: null,
    petPickerVisible: false,

    // 需求输入
    userText: '',
    placeholder: '例如：我家猫咪比较胆小，需要安静的环境，有24小时监控',

    // 结果
    resultList: [],
    aiReasons: {},       // { [serviceId]: '匹配理由' }
    parsedIntent: null,  // AI 解析结果
    loading: false,
    hasResult: false,
    resultCount: 0,
  },

  onLoad() {
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = menuBtn.top + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
  },

  async onShow() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
    if (this.data.petList.length === 0) {
      await this.loadPets();
    }
  },

  async loadPets() {
    const userId = this._userId;
    if (!userId) return;
    try {
      const res = await withTimeout(
        db.collection('pets').where({ ownerId: userId }).orderBy('createTime', 'desc').get(),
        8000
      );
      const petList = (res.data || []).filter(p => p.ownerId === userId);
      let selectedPetId = this.data.selectedPetId;
      if (petList.length > 0 && !petList.find(p => p._id === selectedPetId)) {
        selectedPetId = petList[0]._id;
      }
      const selectedPet = petList.find(p => p._id === selectedPetId) || null;
      this.setData({ petList, selectedPetId, selectedPet });
    } catch (e) {
      console.warn('[SmartMatch] loadPets', e);
    }
  },

  // 宠物选择
  onShowPetPicker() {
    this.setData({ petPickerVisible: true });
  },

  onPetPickerClose() {
    this.setData({ petPickerVisible: false });
  },

  onPetSelect(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.petList.find(p => p._id === id);
    this.setData({ selectedPetId: id, selectedPet: pet, petPickerVisible: false });
  },

  // 需求输入
  onTextInput(e) {
    this.setData({ userText: e.detail.value });
  },

  // 核心：触发智能匹配
  async onMatchTap() {
    if (this.data.loading) return;
    if (!this.data.selectedPet) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }

    this.setData({ loading: true, resultList: [], hasResult: false });

    try {
      // 1. 调用 AI 解析需求
      const pet = this.data.selectedPet;
      const petInfo = {
        name: pet.name || '',
        species: pet.species || '',
        age: pet.age || '',
        breed: pet.breed || '',
      };

      const aiRes = await wx.cloud.callFunction({
        name: 'ai_handler',
        data: {
          action: 'smart_match_parse',
          userText: this.data.userText,
          petInfo,
        },
      });

      const { success, parsed, msg } = aiRes.result || {};
      if (!success || !parsed) {
        wx.showToast({ title: msg || 'AI 解析失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      // 2. 获取用户位置
      let userLocation = null;
      try {
        const loc = await wx.getLocation({ type: 'gcj02' });
        userLocation = { latitude: loc.latitude, longitude: loc.longitude };
      } catch (e) {
        // 定位失败不阻断
      }

      // 3. 查询所有已审核机构及其服务
      const [agenciesRes, servicesRes] = await Promise.all([
        withTimeout(
          db.collection('agency_profiles').where({ auditStatus: 'approved' }).get(),
          8000
        ),
        withTimeout(
          db.collection('agency_services').orderBy('createTime', 'desc').limit(100).get(),
          8000
        ),
      ]);

      // 4. 构建 (agency, service) 对
      const agencies = agenciesRes.data || [];
      const services = servicesRes.data || [];
      const pairs = services.map(s => {
        const agency = agencies.find(a => a._id === s.agencyProfileId);
        return { service: s, agency };
      }).filter(p => p.agency);

      // 5. 硬性过滤
      let filtered = pairs;
      if (parsed.serviceCategory) {
        filtered = filtered.filter(({ service }) => service.category === parsed.serviceCategory);
      }

      // 6. 评分 + 排序
      const scored = filtered.map(p => ({
        ...p,
        matchScore: this._calcScore(p, parsed, userLocation),
      }));

      const results = scored
        .filter(r => r.matchScore >= 30)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      // 7. 补充机构图片、生成匹配理由
      const aiReasons = {};
      for (const r of results) {
        r.service.catTitle = CAT_TITLE_MAP[r.service.category] || '服务';
        if (r.service.images && r.service.images.length) {
          r.service.coverImage = (await resolveTempUrls([r.service.images[0]]))[0];
        }
        // 生成匹配理由
        aiReasons[r.service._id] = this._generateReason(r, parsed);
      }

      this.setData({
        resultList: results,
        aiReasons,
        parsedIntent: parsed,
        loading: false,
        hasResult: true,
        resultCount: results.length,
      });
    } catch (e) {
      console.warn('[SmartMatch] onMatchTap', e);
      wx.showToast({ title: '匹配失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 评分算法
  _calcScore({ service, agency }, parsed, userLocation) {
    let score = 5;

    // 1. 服务类型匹配 (+25)
    if (parsed.serviceCategory && service.category === parsed.serviceCategory) {
      score += 25;
    }

    // 2. 关键词匹配 (+20)
    const textPool = [
      service.name, service.desc,
      agency.orgIntro, agency.serviceScope, agency.orgName
    ].join(' ').toLowerCase();
    const keywordHits = (parsed.keywords || []).filter(kw => textPool.includes(kw.toLowerCase()));
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
      } else if (parsed.budget.min && price < parsed.budget.min) {
        score += 10;
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

    // 7. 紧急度加成 (+5)
    if (parsed.urgency === 'urgent' && service.category === 'foster' && agency.totalCages > 0) {
      score += 5;
    }

    return score;
  },

  // 生成匹配理由
  _generateReason({ service, agency, matchScore }, parsed) {
    const reasons = [];
    if (parsed.serviceCategory && service.category === parsed.serviceCategory) {
      reasons.push('服务类型完全匹配');
    }
    if (parsed.preferences && parsed.preferences.length > 0) {
      const prefPool = [agency.orgIntro, agency.serviceScope, agency.cageDesc]
        .filter(Boolean).join(' ').toLowerCase();
      const hits = parsed.preferences.filter(p => prefPool.includes(p.toLowerCase()));
      if (hits.length > 0) reasons.push('满足' + hits.join('、') + '等偏好');
    }
    if (parsed.budget && parsed.budget.max) {
      const price = Number(service.price) || 0;
      if (price <= parsed.budget.max) reasons.push('价格在预算范围内');
    }
    if (reasons.length === 0) reasons.push('综合评分较高');
    return reasons.slice(0, 2).join('，');
  },

  // 操作跳转
  onDetailTap(e) {
    const agencyId = e.currentTarget.dataset.agencyid;
    if (agencyId) {
      wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
    }
  },

  onBookTap(e) {
    const serviceId = e.currentTarget.dataset.serviceid;
    if (serviceId) {
      wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${serviceId}` });
    }
  },

  onReMatch() {
    this.setData({ resultList: [], hasResult: false, parsedIntent: null });
  },

  goBack() {
    wx.navigateBack();
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add pages/smart-match/smart-match.js
git commit -m "feat: rewrite smart-match page with AI natural language matching + scoring"
```

---

## Task 3: Smart Match Page — WXML Template (Rewrite)

**Files:**
- Rewrite: `pages/smart-match/smart-match.wxml`

- [ ] **Step 1: Replace entire file content**

Replace the entire `pages/smart-match/smart-match.wxml` with:

```xml
<!-- pages/smart-match/smart-match.wxml -->
<view class="match-page">

  <!-- 自定义导航栏 -->
  <view class="nav-bar" style="padding-top:{{statusBarHeight}}px;">
    <view class="nav-bar__inner">
      <view class="nav-bar__back" bindtap="goBack">
        <van-icon name="arrow-left" size="40rpx" color="#fff" />
      </view>
      <text class="nav-bar__title">智能匹配</text>
      <view class="nav-bar__right"></view>
    </view>
  </view>

  <!-- 内容区 -->
  <view class="page-body" style="padding-top:{{navBarHeight + 16}}px;">

    <!-- 选择宠物 -->
    <view class="input-card">
      <text class="input-card__label">选择宠物</text>
      <view class="pet-selector" bindtap="onShowPetPicker">
        <view wx:if="{{selectedPet}}" class="pet-selector__chosen">
          <image class="pet-selector__avatar" src="{{selectedPet.photo || ''}}" wx:if="{{selectedPet.photo}}" mode="aspectFill" />
          <view class="pet-selector__avatar pet-selector__avatar--default" wx:else>
            <van-icon name="aim" size="32rpx" color="#FF9800" />
          </view>
          <view class="pet-selector__info">
            <text class="pet-selector__name">{{selectedPet.name}}</text>
            <text class="pet-selector__meta">{{selectedPet.species || '未知'}} · {{selectedPet.age || ''}}</text>
          </view>
        </view>
        <view wx:else class="pet-selector__empty">
          <text class="pet-selector__empty-text">请选择宠物</text>
        </view>
        <van-icon name="arrow" size="28rpx" color="#C4B8AC" />
      </view>
    </view>

    <!-- 描述需求 -->
    <view class="input-card">
      <text class="input-card__label">描述你的需求</text>
      <view class="textarea-box">
        <textarea
          class="textarea-input"
          placeholder="{{placeholder}}"
          placeholder-class="textarea-placeholder"
          value="{{userText}}"
          bindinput="onTextInput"
          maxlength="200"
          auto-height
        />
        <text class="textarea-count">{{userText.length}}/200</text>
      </view>
      <view class="textarea-tips">
        <text class="textarea-tips__label">试试：</text>
        <text class="textarea-tips__item">"附近可以寄养猫咪的地方，价格实惠一点"</text>
      </view>
    </view>

    <!-- 匹配按钮 -->
    <view class="match-btn-wrap">
      <van-button
        type="primary"
        color="linear-gradient(135deg, #FF9800, #FFB74D)"
        round
        loading="{{loading}}"
        loading-text="AI 分析中..."
        bindtap="onMatchTap"
        custom-style="width:100%;height:88rpx;font-size:30rpx;font-weight:600;"
      >
        <van-icon name="aim" size="28rpx" style="margin-right: 8rpx;" /> 智能匹配
      </van-button>
    </view>

    <!-- 匹配结果 -->
    <block wx:if="{{hasResult}}">
      <view class="result-header">
        <text class="result-header__title">为你找到 {{resultCount}} 个匹配方案</text>
      </view>

      <view class="result-list">
        <view class="result-card" wx:for="{{resultList}}" wx:key="_id">

          <!-- 匹配度条 -->
          <view class="result-card__score-bar">
            <view class="result-card__score-fill {{item.matchScore >= 90 ? 'score-high' : item.matchScore >= 70 ? 'score-med' : 'score-low'}}" style="width: {{item.matchScore}}%;"></view>
            <text class="result-card__score-text">匹配度 {{item.matchScore}}%</text>
          </view>

          <!-- 机构信息 -->
          <view class="result-card__body">
            <view class="result-card__header">
              <text class="result-card__agency-name">{{item.agency.orgName}}</text>
              <van-tag round plain color="#FFF3E0" text-color="#FF9800" size="medium">{{item.service.catTitle}}</van-tag>
            </view>
            <text class="result-card__location" wx:if="{{item.agency.region}}">
              <van-icon name="location-o" size="22rpx" color="#8C7A6B" /> {{item.agency.region}}
            </text>
            <text class="result-card__service">
              {{item.service.name}} <text class="result-card__price">¥{{item.service.price}}/{{item.service.priceUnit || '次'}}</text>
            </text>
            <text class="result-card__reason" wx:if="{{aiReasons[item.service._id]}}">
              {{aiReasons[item.service._id]}}
            </text>
          </view>

          <!-- 操作按钮 -->
          <view class="result-card__actions">
            <van-button
              size="small"
              round
              plain
              color="#FF9800"
              bindtap="onDetailTap"
              data-agencyid="{{item.agency._id}}"
              custom-style="flex:1;height:64rpx;font-size:24rpx;"
            >
              查看详情
            </van-button>
            <van-button
              size="small"
              round
              type="primary"
              color="#FF9800"
              bindtap="onBookTap"
              data-serviceid="{{item.service._id}}"
              custom-style="flex:1;height:64rpx;font-size:24rpx;"
            >
              立即预约
            </van-button>
          </view>
        </view>
      </view>

      <!-- 重新匹配 -->
      <view class="rematch-wrap">
        <van-button
          size="small"
          round
          plain
          color="#8C7A6B"
          bindtap="onReMatch"
          custom-style="height:64rpx;font-size:24rpx;"
        >
          重新匹配
        </van-button>
      </view>
    </block>

    <!-- 空结果 -->
    <view class="empty-wrap" wx:if="{{hasResult && resultList.length === 0}}">
      <van-icon name="search" size="80rpx" color="#F0E6D8" />
      <text class="empty-wrap__text">暂无合适推荐</text>
      <text class="empty-wrap__sub">试试换个描述方式</text>
    </view>

  </view>

  <!-- 宠物选择弹窗 -->
  <van-popup show="{{petPickerVisible}}" position="bottom" round bind:close="onPetPickerClose">
    <view class="pet-picker">
      <view class="pet-picker__title">选择宠物</view>
      <view class="pet-picker__list">
        <view
          class="pet-picker__item {{selectedPetId === item._id ? 'pet-picker__item--active' : ''}}"
          wx:for="{{petList}}"
          wx:key="_id"
          bindtap="onPetSelect"
          data-id="{{item._id}}"
        >
          <image class="pet-picker__avatar" src="{{item.photo || ''}}" wx:if="{{item.photo}}" mode="aspectFill" />
          <view class="pet-picker__avatar pet-picker__avatar--default" wx:else>
            <van-icon name="aim" size="32rpx" color="#FF9800" />
          </view>
          <view class="pet-picker__info">
            <text class="pet-picker__name">{{item.name}}</text>
            <text class="pet-picker__meta">{{item.species || '未知'}} · {{item.age || ''}}</text>
          </view>
          <van-icon wx:if="{{selectedPetId === item._id}}" name="success" size="32rpx" color="#FF9800" />
        </view>
      </view>
      <view wx:if="{{petList.length === 0}}" class="pet-picker__empty">
        <text>暂无宠物档案，请先添加宠物</text>
      </view>
    </view>
  </van-popup>

</view>
```

- [ ] **Step 2: Commit**

```bash
git add pages/smart-match/smart-match.wxml
git commit -m "feat: rewrite smart-match wxml with pet selector, AI input, and scored results"
```

---

## Task 4: Smart Match Page — Less Styles (Rewrite)

**Files:**
- Rewrite: `pages/smart-match/smart-match.less`

- [ ] **Step 1: Replace entire file content**

Replace the entire `pages/smart-match/smart-match.less` with:

```less
/* pages/smart-match/smart-match.less */

.match-page {
  min-height: 100vh;
  background: #FFF8F0;
}

/* ===== 自定义导航栏 ===== */
.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: linear-gradient(135deg, #FF9800, #FFB74D);
}

.nav-bar__inner {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 16rpx;
}

.nav-bar__back {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-bar__right {
  width: 72rpx;
}

.nav-bar__title {
  flex: 1;
  text-align: center;
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2rpx;
}

/* ===== 页面内容 ===== */
.page-body {
  padding-bottom: 60rpx;
}

/* ===== 输入卡片 ===== */
.input-card {
  margin: 24rpx 28rpx 0;
  background: #FFFAF5;
  border-radius: 24rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(61, 44, 30, 0.06);
}

.input-card__label {
  font-size: 28rpx;
  font-weight: 600;
  color: #3D2C1E;
  display: block;
  margin-bottom: 16rpx;
}

/* ===== 宠物选择器 ===== */
.pet-selector {
  display: flex;
  align-items: center;
  background: #FFF8F0;
  border: 2rpx solid #F0E6D8;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}

.pet-selector__chosen {
  display: flex;
  align-items: center;
  flex: 1;
}

.pet-selector__avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  margin-right: 16rpx;
  background: #F0E6D8;
  flex-shrink: 0;
}

.pet-selector__avatar--default {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFF3E0;
}

.pet-selector__info {
  display: flex;
  flex-direction: column;
}

.pet-selector__name {
  font-size: 28rpx;
  color: #3D2C1E;
  font-weight: 600;
}

.pet-selector__meta {
  font-size: 22rpx;
  color: #8C7A6B;
  margin-top: 4rpx;
}

.pet-selector__empty {
  flex: 1;
}

.pet-selector__empty-text {
  font-size: 26rpx;
  color: #C4B8AC;
}

/* ===== 文本输入 ===== */
.textarea-box {
  background: #FFF8F0;
  border: 2rpx solid #F0E6D8;
  border-radius: 16rpx;
  padding: 20rpx;
  position: relative;
}

.textarea-input {
  width: 100%;
  min-height: 160rpx;
  font-size: 28rpx;
  color: #3D2C1E;
  line-height: 1.6;
  box-sizing: border-box;
}

.textarea-placeholder {
  color: #C4B8AC;
  font-size: 26rpx;
}

.textarea-count {
  display: block;
  text-align: right;
  font-size: 22rpx;
  color: #C4B8AC;
  margin-top: 8rpx;
}

.textarea-tips {
  display: flex;
  align-items: flex-start;
  margin-top: 12rpx;
  gap: 8rpx;
}

.textarea-tips__label {
  font-size: 22rpx;
  color: #8C7A6B;
  flex-shrink: 0;
}

.textarea-tips__item {
  font-size: 22rpx;
  color: #FF9800;
  background: #FFF3E0;
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
}

/* ===== 匹配按钮 ===== */
.match-btn-wrap {
  margin: 28rpx 28rpx 0;
}

/* ===== 结果区 ===== */
.result-header {
  padding: 28rpx 32rpx 8rpx;
}

.result-header__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #3D2C1E;
}

.result-list {
  padding: 0 28rpx;
}

.result-card {
  background: #FFFAF5;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(61, 44, 30, 0.06);
}

/* 匹配度进度条 */
.result-card__score-bar {
  position: relative;
  height: 48rpx;
  background: #F0E6D8;
  overflow: hidden;
}

.result-card__score-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  transition: width 0.5s ease;
}

.score-high {
  background: linear-gradient(90deg, #66BB6A, #81C784);
}

.score-med {
  background: linear-gradient(90deg, #FF9800, #FFB74D);
}

.score-low {
  background: linear-gradient(90deg, #BDBDBD, #E0E0E0);
}

.result-card__score-text {
  position: absolute;
  left: 20rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 22rpx;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.2);
}

/* 卡片内容 */
.result-card__body {
  padding: 20rpx 24rpx;
}

.result-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.result-card__agency-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #3D2C1E;
}

.result-card__location {
  font-size: 22rpx;
  color: #8C7A6B;
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.result-card__service {
  font-size: 26rpx;
  color: #3D2C1E;
  margin-top: 12rpx;
}

.result-card__price {
  font-weight: 700;
  color: #FF9800;
}

.result-card__reason {
  font-size: 22rpx;
  color: #8C7A6B;
  margin-top: 8rpx;
  padding: 8rpx 16rpx;
  background: #FFF8E1;
  border-radius: 12rpx;
  display: inline-block;
}

/* 操作按钮 */
.result-card__actions {
  display: flex;
  padding: 0 24rpx 20rpx;
  gap: 16rpx;
}

/* 重新匹配 */
.rematch-wrap {
  display: flex;
  justify-content: center;
  padding: 16rpx 0 40rpx;
}

/* ===== 空状态 ===== */
.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;
}

.empty-wrap__text {
  font-size: 28rpx;
  color: #8C7A6B;
  margin-top: 20rpx;
}

.empty-wrap__sub {
  font-size: 24rpx;
  color: #C4B8AC;
  margin-top: 8rpx;
}

/* ===== 宠物选择弹窗 ===== */
.pet-picker {
  padding: 32rpx;
}

.pet-picker__title {
  font-size: 32rpx;
  font-weight: 700;
  color: #3D2C1E;
  text-align: center;
  margin-bottom: 24rpx;
}

.pet-picker__list {
  max-height: 600rpx;
  overflow-y: auto;
}

.pet-picker__item {
  display: flex;
  align-items: center;
  padding: 20rpx 16rpx;
  border-radius: 16rpx;
  margin-bottom: 8rpx;
  transition: background 0.15s ease;
}

.pet-picker__item:active {
  background: #FFF8F0;
}

.pet-picker__item--active {
  background: #FFF3E0;
}

.pet-picker__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-right: 16rpx;
  background: #F0E6D8;
  flex-shrink: 0;
}

.pet-picker__avatar--default {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFF3E0;
}

.pet-picker__info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pet-picker__name {
  font-size: 28rpx;
  color: #3D2C1E;
  font-weight: 600;
}

.pet-picker__meta {
  font-size: 22rpx;
  color: #8C7A6B;
  margin-top: 4rpx;
}

.pet-picker__empty {
  text-align: center;
  padding: 40rpx 0;
  font-size: 26rpx;
  color: #C4B8AC;
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/smart-match/smart-match.less
git commit -m "feat: rewrite smart-match less styles for AI matching UI"
```

---

## Task 5: Smart Match Page — JSON Config Update

**Files:**
- Modify: `pages/smart-match/smart-match.json`

- [ ] **Step 1: Add van-picker component**

The current JSON already has the needed Vant components. Only add `van-picker` if not present. The current config has: van-icon, van-tag, van-button, van-popup, van-loading, van-divider, van-search. We need `van-popup` (already present). No changes needed to JSON since `van-popup` is already registered.

However, verify `van-popup` is present and confirm the file is correct:

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "van-icon": "/miniprogram_npm/@vant/weapp/icon/index",
    "van-tag": "/miniprogram_npm/@vant/weapp/tag/index",
    "van-button": "/miniprogram_npm/@vant/weapp/button/index",
    "van-popup": "/miniprogram_npm/@vant/weapp/popup/index",
    "van-loading": "/miniprogram_npm/@vant/weapp/loading/index",
    "van-divider": "/miniprogram_npm/@vant/weapp/divider/index",
    "van-search": "/miniprogram_npm/@vant/weapp/search/index"
  }
}
```

No changes required — file already has all needed components.

- [ ] **Step 2: Commit (no-op, skip if no changes)**

```bash
# No changes needed — JSON already correct
```

---

## Task 6: Update Compiled WXSS

**Files:**
- Rewrite: `pages/smart-match/smart-match.wxss`

- [ ] **Step 1: Copy less content to wxss**

The project maintains both `.less` and `.wxss` files. After rewriting `.less` in Task 4, the `.wxss` must match. Copy the exact content from `smart-match.less` to `smart-match.wxss`, replacing `{{` CSS template syntax with actual values if needed (in this case, the Less file has no WeChat template syntax — it's pure CSS — so it can be copied as-is).

Read `pages/smart-match/smart-match.less` and write the same content to `pages/smart-match/smart-match.wxss`.

- [ ] **Step 2: Commit**

```bash
git add pages/smart-match/smart-match.wxss
git commit -m "chore: sync smart-match wxss with less styles"
```

---

## Task 7: Deploy Cloud Function

**Files:**
- Modify: `cloudfunctions/ai_handler/` (deploy)

- [ ] **Step 1: Install dependencies if needed**

```bash
cd cloudfunctions/ai_handler && npm install
```

- [ ] **Step 2: Deploy via WeChat DevTools**

The cloud function must be deployed through WeChat DevTools (右键 cloudfunctions/ai_handler → 上传并部署：云端安装依赖).

Alternatively, if using CLI:
```bash
# This step is manual — deploy via WeChat DevTools IDE
```

- [ ] **Step 3: Verify deployment**

Test by calling the action from WeChat DevTools cloud function tester:
```json
{
  "action": "smart_match_parse",
  "userText": "我家猫需要寄养3天",
  "petInfo": { "name": "小白", "species": "猫", "age": "3岁", "breed": "英短" }
}
```

Expected: `{"success": true, "parsed": {"serviceCategory": "foster", "keywords": [...], ...}}`

---

## Task 8: End-to-End Verification

- [ ] **Step 1: Homepage entry**

Open the mini program homepage. Verify the "智能匹配" icon appears in the func-entry grid. Tap it → navigates to smart-match page.

- [ ] **Step 2: Pet selector**

On the smart-match page, tap the pet selector → popup shows user's pets. Select a pet → popup closes, pet info displayed.

- [ ] **Step 3: AI parse + results**

Type "我家猫需要寄养3天，要干净安静的" → tap "智能匹配" button → loading spinner → results appear with match scores, agency names, service names, prices, and reasons.

- [ ] **Step 4: Empty pet text**

Clear the text field, keep pet selected → tap match → AI recommends based on pet info alone (serviceCategory may be null, broader results).

- [ ] **Step 5: Action buttons**

Tap "查看详情" → navigates to agency detail page. Tap "立即预约" → navigates to service detail page.

- [ ] **Step 6: Re-match**

Tap "重新匹配" → results cleared, back to input state.

- [ ] **Step 7: No results handling**

If no agencies match (e.g., filter to a nonexistent category), empty state shows "暂无合适推荐"。
