# 首页视觉重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页升级为"新拟态 + 活力渐变"混合风格，增加卡片入场动画、点击反馈动效。

**Architecture:** 基于现有 `pages/index` 三件套（wxml/js/less）进行改造。样式层全面重写为新拟态阴影+渐变体系；结构层将两列网格改为横向滚动卡片；交互层使用微信小程序 `animation` API 实现入场动效。

**Tech Stack:** 微信小程序原生 + Vant Weapp + Less

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `pages/index/index.less` | 重写 | 新拟态阴影、渐变、动画关键帧 |
| `pages/index/index.wxml` | 修改 | 横向滚动结构、动画类绑定 |
| `pages/index/index.js` | 修改 | 入场动画触发、搜索框动效 |

---

## Task 1: 重写 index.less（新拟态 + 渐变 + 动画关键帧）

**Files:**
- Modify: `pages/index/index.less`

- [ ] **Step 1: 定义新拟态阴影变量与动画关键帧**

在文件顶部添加 Less 变量和 `@keyframes`：

```less
/* ===== 变量 ===== */
@bg-page: #FFF8F0;
@bg-card: #FFFAF5;
@color-primary: #FF9800;
@color-text: #3D2C1E;
@color-text-sub: #8C7A6B;
@shadow-dark: rgba(174, 144, 116, 0.15);
@shadow-light: rgba(255, 255, 255, 0.9);

/* ===== 动画关键帧 ===== */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(40rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

- [ ] **Step 2: 重写页面与头部样式**

```less
.index-page {
  min-height: 100vh;
  background: @bg-page;
  padding-bottom: 20rpx;
}

/* ===== 渐变头部 ===== */
.hero-header {
  background: linear-gradient(135deg, #FF9800, #FFB74D, #FF8A65);
  padding: 0 32rpx 60rpx;
  border-radius: 0 0 50rpx 50rpx;
  position: relative;
  overflow: hidden;
}

.hero-header::before {
  content: '';
  position: absolute;
  top: 20rpx;
  right: -30rpx;
  width: 120px;
  height: 120px;
  background: rgba(255,255,255,0.15);
  border-radius: 50%;
}

.hero-header::after {
  content: '';
  position: absolute;
  bottom: 10rpx;
  left: -20rpx;
  width: 80px;
  height: 80px;
  background: rgba(255,255,255,0.1);
  border-radius: 50%;
}

.hero-header__inner {
  padding-top: 60rpx;
  position: relative;
  z-index: 1;
}

.hero-greeting {
  display: flex;
  flex-direction: column;
  margin-bottom: 28rpx;
}

.hero-greeting__title {
  font-size: 44rpx;
  font-weight: 800;
  color: #fff;
  letter-spacing: 2rpx;
}

.hero-greeting__sub {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 8rpx;
}
```

- [ ] **Step 3: 重写搜索栏样式（新拟态）**

```less
.hero-search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  position: relative;
}

.hero-search__input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 40rpx;
  padding: 0 24rpx;
  height: 72rpx;
  box-shadow: 6rpx 6rpx 16rpx rgba(0,0,0,0.08), -4rpx -4rpx 12rpx rgba(255,255,255,0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hero-search__input-wrap:focus-within {
  transform: scale(1.02);
  box-shadow: 8rpx 8rpx 20rpx rgba(0,0,0,0.12), -4rpx -4rpx 12rpx rgba(255,255,255,0.3);
}

.hero-search__input {
  flex: 1;
  font-size: 28rpx;
  color: @color-text;
  height: 72rpx;
  line-height: 72rpx;
  margin-left: 12rpx;
}

.hero-search__clear {
  flex-shrink: 0;
  padding: 8rpx;
  margin-left: 8rpx;
}

.hero-search__btn {
  flex-shrink: 0;
  background: linear-gradient(135deg, #FF9800, #FFB74D);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  padding: 0 32rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 40rpx;
  text-align: center;
  box-shadow: 0 4rpx 12rpx rgba(255, 152, 0, 0.3);
  transition: transform 0.12s ease;
}

.hero-search__btn:active {
  transform: scale(0.96);
  box-shadow: 0 2rpx 6rpx rgba(255, 152, 0, 0.2);
}
```

- [ ] **Step 4: 重写轮播海报样式**

```less
.banner-section {
  margin: 24rpx 32rpx 0;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
  animation-delay: 0.1s;
}

.banner-swiper {
  height: 340rpx;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(61, 44, 30, 0.1);
}

.banner-image {
  width: 100%;
  height: 100%;
  display: block;
}
```

- [ ] **Step 5: 重写功能入口样式（新拟态凸起）**

```less
.func-entry {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 32rpx 24rpx;
  margin: -40rpx 24rpx 0;
  background: #FFFAF5;
  border-radius: 24rpx;
  box-shadow: 6rpx 6rpx 16rpx @shadow-dark, -6rpx -6rpx 16rpx @shadow-light;
  position: relative;
  z-index: 2;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
  animation-delay: 0.2s;
}

.func-entry__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.12s ease;
}

.func-entry__item:active {
  transform: scale(0.95);
}

.func-entry__icon {
  width: 100rpx;
  height: 100rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14rpx;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.func-entry__icon--orange {
  background: linear-gradient(135deg, #FFF3E0, #FFE0B2);
  box-shadow: 0 4rpx 12rpx rgba(255, 152, 0, 0.15);
}

.func-entry__icon--purple {
  background: linear-gradient(135deg, #F3E5F5, #E1BEE7);
  box-shadow: 0 4rpx 12rpx rgba(171, 126, 224, 0.15);
}

.func-entry__icon--blue {
  background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
  box-shadow: 0 4rpx 12rpx rgba(33, 150, 243, 0.15);
}

.func-entry__item:active .func-entry__icon {
  transform: scale(0.92);
  box-shadow: 0 2rpx 6rpx rgba(0,0,0,0.1);
}

.func-entry__label {
  font-size: 24rpx;
  color: @color-text;
  font-weight: 500;
}
```

- [ ] **Step 6: 重写板块标题栏**

```less
.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 32rpx 16rpx;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
}

.section-bar__title {
  font-size: 34rpx;
  font-weight: 700;
  color: @color-text;
}

.section-bar__more {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: @color-text-sub;
  transition: transform 0.12s ease;
}

.section-bar__more:active {
  transform: scale(0.95);
}

.section-bar__more text {
  margin-right: 4rpx;
}
```

- [ ] **Step 7: 重写横向滚动卡片样式（机构 + 服务）**

将原先的两列 `.card-grid`、`.agency-card`、`.svc-card` 全部替换为横向滚动样式：

```less
/* ===== 横向滚动容器 ===== */
.scroll-cards {
  display: flex;
  flex-wrap: nowrap;
  padding: 0 32rpx;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.scroll-cards::-webkit-scrollbar {
  display: none;
}

.scroll-cards__item {
  flex-shrink: 0;
  width: 280rpx;
  margin-right: 20rpx;
  background: linear-gradient(180deg, #FFFAF5, #FFF3E0);
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 6rpx 6rpx 16rpx @shadow-dark, -6rpx -6rpx 16rpx @shadow-light;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  opacity: 0;
  animation: fadeInUp 0.5s ease forwards;
}

.scroll-cards__item:last-child {
  margin-right: 32rpx;
}

.scroll-cards__item:active {
  transform: scale(0.96);
  box-shadow: 3rpx 3rpx 8rpx rgba(174, 144, 116, 0.12), -3rpx -3rpx 8rpx rgba(255, 255, 255, 0.95);
}

.scroll-cards__img {
  width: 100%;
  height: 160rpx;
  display: block;
  background: #F0E6D8;
}

.scroll-cards__body {
  padding: 16rpx 20rpx 20rpx;
}

.scroll-cards__tag-row { margin-bottom: 10rpx; }

.scroll-cards__name {
  font-size: 28rpx;
  font-weight: 600;
  color: @color-text;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scroll-cards__loc,
.scroll-cards__agency {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: @color-text-sub;
}

.scroll-cards__loc-text {
  margin-left: 6rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scroll-cards__price-row {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
}

.scroll-cards__price {
  font-size: 30rpx;
  font-weight: 700;
  color: #E65100;
}

.scroll-cards__unit {
  font-size: 22rpx;
  color: @color-text-sub;
  margin-left: 4rpx;
}
```

- [ ] **Step 8: 保留搜索建议、加载、空状态样式**

将原文件中的 `.search-suggestions`、`.suggestion-item`、`.loading-wrap`、`.empty-wrap`、`.safe-area-bottom` 样式保留到文件末尾。

---

## Task 2: 修改 index.wxml（横向滚动结构 + 动画类）

**Files:**
- Modify: `pages/index/index.wxml`

- [ ] **Step 1: 修改推荐机构区块为横向滚动**

将原推荐机构的两列网格：

```xml
  <view class="card-grid" wx:if="{{agencyList.length > 0}}">
    <view class="agency-card" wx:for="{{agencyList}}" wx:key="_id" bindtap="onAgencyTap" data-id="{{item._id}}">
      ...
    </view>
  </view>
```

替换为：

```xml
  <view class="scroll-cards" wx:if="{{agencyList.length > 0}}">
    <view class="scroll-cards__item" wx:for="{{agencyList}}" wx:key="_id" bindtap="onAgencyTap" data-id="{{item._id}}" style="animation-delay: {{300 + index * 80}}ms">
      <image class="scroll-cards__img" src="{{item.storefrontImage || item.envImages[0] || '/static/pet/logo.png'}}" mode="aspectFill" />
      <view class="scroll-cards__body">
        <view class="scroll-cards__tag-row">
          <van-tag round plain color="#FFF3E0" text-color="#FF9800" size="medium">{{item.businessType}}</van-tag>
        </view>
        <text class="scroll-cards__name">{{item.orgName}}</text>
        <view class="scroll-cards__loc">
          <van-icon name="location-o" size="22rpx" color="#8C7A6B" />
          <text class="scroll-cards__loc-text">{{item.detailAddress || item.region || '暂无地址'}}</text>
        </view>
      </view>
    </view>
  </view>
```

- [ ] **Step 2: 修改机构服务区块为横向滚动**

将原机构服务的两列网格：

```xml
  <view class="card-grid" wx:if="{{svcList.length > 0}}">
    <view class="svc-card" wx:for="{{svcList}}" wx:key="_id" bindtap="onSvcTap" data-id="{{item._id}}">
      ...
    </view>
  </view>
```

替换为：

```xml
  <view class="scroll-cards" wx:if="{{svcList.length > 0}}">
    <view class="scroll-cards__item" wx:for="{{svcList}}" wx:key="_id" bindtap="onSvcTap" data-id="{{item._id}}" style="animation-delay: {{400 + index * 80}}ms">
      <image class="scroll-cards__img" src="{{item.images[0] || '/static/pet/logo.png'}}" mode="aspectFill" />
      <view class="scroll-cards__body">
        <view class="scroll-cards__tag-row">
          <van-tag round plain color="#FFF3E0" text-color="#FF9800" size="medium">{{item.catTitle}}</van-tag>
        </view>
        <text class="scroll-cards__name">{{item.name}}</text>
        <view class="scroll-cards__agency" wx:if="{{item.agencyName}}">
          <van-icon name="shop-o" size="20rpx" color="#999" />
          <text style="font-size:22rpx;color:#999;margin-left:6rpx">{{item.agencyName}}</text>
        </view>
        <view class="scroll-cards__price-row">
          <text class="scroll-cards__price">¥{{item.price}}</text>
          <text class="scroll-cards__unit">/{{item.priceUnit || '次'}}</text>
        </view>
      </view>
    </view>
  </view>
```

- [ ] **Step 3: 为板块标题添加动画延迟**

给两个 `.section-bar` 添加内联样式控制动画延迟：

第一个（推荐机构）：`style="animation-delay: 0.2s"`
第二个（机构服务）：`style="animation-delay: 0.35s"`

---

## Task 3: 修改 index.js（入场动画逻辑）

**Files:**
- Modify: `pages/index/index.js`

- [ ] **Step 1: 在 `onShow` 中添加入场动画触发**

由于 CSS `animation` 会在页面显示时自动触发，但微信小程序页面 `onShow` 复用时动画不会重新播放。需要在 `onShow` 中通过切换类名强制重启动画。

在 `onShow()` 方法末尾添加：

```javascript
    // 触发动画重播
    this.setData({ _animateKey: Date.now() });
```

- [ ] **Step 2: 在 data 中添加 `_animateKey`**

```javascript
  data: {
    // ... 原有数据 ...
    banners: [...],
    _animateKey: 0,
  },
```

- [ ] **Step 3: 在 wxml 中为动画容器绑定 key**

给 `.index-page` 外层或需要重播动画的区块绑定 `key="{{_animateKey}}"`，使得 `setData` 后整个页面重新渲染并触发动画。

实际上更简单的方式：在 `onShow` 中先隐藏再显示，或使用 `animation` API。

**推荐方案**：使用微信小程序 `animation` API 在 `onShow` 中手动执行动画，避免 `key` 导致的全量重绘。

在 `onShow` 末尾添加：

```javascript
    // 执行入场动画
    this.runEntranceAnimation();
```

并添加方法：

```javascript
  runEntranceAnimation() {
    const sections = ['.hero-header', '.banner-section', '.func-entry', '.section-bar', '.scroll-cards__item'];
    // 由于 CSS animation 已经定义，这里只需要确保元素可见
    // 如果页面是从后台返回，animation 不会自动重播
    // 通过短暂移除再添加 animation 类来触发（在 less 中使用 animation 直接绑定即可）
  },
```

**简化处理**：由于微信小程序从其他页面返回时 `onShow` 会触发，而 CSS animation 在元素重新插入 DOM 时才会播放。对于页面级返回，元素并未重新插入，因此动画不会重播。这通常是可接受的（动画只在首次加载时播放一次）。

如果用户希望每次进入都播放，可在 `onShow` 中：

```javascript
    this.setData({ _animateTrigger: false });
    setTimeout(() => this.setData({ _animateTrigger: true }), 50);
```

并在 wxml 中用 `wx:if="{{_animateTrigger}}"` 包裹动画区域。

**当前计划采用简化方案**：CSS animation 仅在首次加载时播放一次，不在 `onShow` 中额外处理。如后续有需求再增加重播逻辑。

---

## Task 4: 验证与测试

- [ ] **Step 1: 编译预览**

在微信开发者工具中编译，检查：
1. 头部渐变是否正常显示
2. 几何装饰圆形是否可见
3. 搜索框聚焦时是否有缩放效果
4. 功能入口是否有新拟态阴影
5. 轮播海报是否自动播放
6. 推荐机构/服务是否为横向滚动
7. 卡片点击是否有缩放反馈
8. 各区块是否按延迟渐入

- [ ] **Step 2: 真机测试**

在真机上测试滚动流畅度和动画性能。如有卡顿，减少阴影层数或简化动画。

---

## Spec 覆盖检查

| Spec 要求 | 对应任务 |
|-----------|----------|
| 新拟态阴影公式 | Task 1 Step 3/5/7 |
| 头部多层渐变 + 几何装饰 | Task 1 Step 2 |
| 功能入口图标渐变背景 | Task 1 Step 5 |
| 卡片渐变背景 | Task 1 Step 7 |
| 横向滚动卡片布局 | Task 2 |
| 卡片入场动画 fadeInUp | Task 1 Step 1/7 + Task 2 |
| 按钮/卡片点击缩放反馈 | Task 1 Step 3/5/7 |
| 搜索框聚焦动效 | Task 1 Step 3 |

全部覆盖，无遗漏。
