# UI优化第一批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决5个代码质量问题，建立统一的组件架构和设计系统，提升代码可维护性和开发效率。

**Architecture:** 采用组件化架构，创建custom-nav-bar、empty-state、review-popup三个基础组件，统一变量系统，编译Less文件，清理异常文件。

**Tech Stack:** 微信小程序原生 + Vant Weapp + Less预处理器

---

## 文件结构

### 新建文件
- `components/custom-nav-bar/custom-nav-bar.wxml` - 导航栏组件模板
- `components/custom-nav-bar/custom-nav-bar.wxss` - 导航栏组件样式
- `components/custom-nav-bar/custom-nav-bar.js` - 导航栏组件逻辑
- `components/custom-nav-bar/custom-nav-bar.json` - 导航栏组件配置
- `components/empty-state/empty-state.wxml` - 空状态组件模板
- `components/empty-state/empty-state.wxss` - 空状态组件样式
- `components/empty-state/empty-state.js` - 空状态组件逻辑
- `components/empty-state/empty-state.json` - 空状态组件配置
- `components/review-popup/review-popup.wxml` - 评价弹窗组件模板
- `components/review-popup/review-popup.wxss` - 评价弹窗组件样式
- `components/review-popup/review-popup.js` - 评价弹窗组件逻辑
- `components/review-popup/review-popup.json` - 评价弹窗组件配置

### 修改文件
- `variable.less` - 更新变量定义
- `app.wxss` - 添加CSS变量
- `app.json` - 注册组件
- 多个页面文件 - 使用新组件替换重复代码

### 删除文件
- `packagePet/pages/pet/pet.wxml.wxml` - 异常文件

---

## Task 1: 编译Less文件

**Files:**
- Check: 14个页面的.less文件
- Generate: 14个页面的.wxss文件

- [ ] **Step 1: 检查Less文件是否存在**

```bash
# 检查所有需要编译的Less文件
ls -la pages/admin/admin.less
ls -la pages/admin/agencies.less
ls -la pages/admin/audit.less
ls -la pages/admin/audit-detail.less
ls -la pages/admin/dashboard.less
ls -la pages/agency-detail/agency-detail.less
ls -la pages/agency-register/agency-register.less
ls -la pages/browse-agencies/browse-agencies.less
ls -la pages/browse-services/browse-services.less
ls -la pages/health-add/health-add.less
ls -la pages/order-detail/order-detail.less
ls -la pages/payment/payment.less
ls -la pages/pet-detail/pet-detail.less
ls -la packagePet/pages/pet/pet.wxml.less
```

Expected: 所有文件存在

- [ ] **Step 2: 编译Less文件为wxss**

```bash
# 使用Less编译器编译所有文件
npx lessc pages/admin/admin.less pages/admin/admin.wxss
npx lessc pages/admin/agencies.less pages/admin/agencies.wxss
npx lessc pages/admin/audit.less pages/admin/audit.wxss
npx lessc pages/admin/audit-detail.less pages/admin/audit-detail.wxss
npx lessc pages/admin/dashboard.less pages/admin/dashboard.wxss
npx lessc pages/agency-detail/agency-detail.less pages/agency-detail/agency-detail.wxss
npx lessc pages/agency-register/agency-register.less pages/agency-register/agency-register.wxss
npx lessc pages/browse-agencies/browse-agencies.less pages/browse-agencies/browse-agencies.wxss
npx lessc pages/browse-services/browse-services.less pages/browse-services/browse-services.wxss
npx lessc pages/health-add/health-add.less pages/health-add/health-add.wxss
npx lessc pages/order-detail/order-detail.less pages/order-detail/order-detail.wxss
npx lessc pages/payment/payment.less pages/payment/payment.wxss
npx lessc pages/pet-detail/pet-detail.less pages/pet-detail/pet-detail.wxss
npx lessc packagePet/pages/pet/pet.wxml.less packagePet/pages/pet/pet.wxml.wxss
```

Expected: 所有.wxss文件生成成功

- [ ] **Step 3: 验证编译结果**

```bash
# 检查生成的wxss文件
ls -la pages/admin/*.wxss
ls -la pages/agency-detail/*.wxss
ls -la pages/agency-register/*.wxss
ls -la pages/browse-agencies/*.wxss
ls -la pages/browse-services/*.wxss
ls -la pages/health-add/*.wxss
ls -la pages/order-detail/*.wxss
ls -la pages/payment/*.wxss
ls -la pages/pet-detail/*.wxss
ls -la packagePet/pages/pet/*.wxss
```

Expected: 14个.wxss文件存在

- [ ] **Step 4: 提交编译结果**

```bash
git add pages/admin/*.wxss pages/agency-detail/*.wxss pages/agency-register/*.wxss pages/browse-agencies/*.wxss pages/browse-services/*.wxss pages/health-add/*.wxss pages/order-detail/*.wxss pages/payment/*.wxss pages/pet-detail/*.wxss packagePet/pages/pet/*.wxss
git commit -m "fix: compile less files to wxss for 14 pages"
```

---

## Task 2: 创建custom-nav-bar组件

**Files:**
- Create: `components/custom-nav-bar/custom-nav-bar.wxml`
- Create: `components/custom-nav-bar/custom-nav-bar.wxss`
- Create: `components/custom-nav-bar/custom-nav-bar.js`
- Create: `components/custom-nav-bar/custom-nav-bar.json`

- [ ] **Step 1: 创建组件目录**

```bash
mkdir -p components/custom-nav-bar
```

- [ ] **Step 2: 创建组件配置文件**

```json
{
  "component": true,
  "usingComponents": {
    "van-icon": "@vant/weapp/icon/index"
  }
}
```

保存到 `components/custom-nav-bar/custom-nav-bar.json`

- [ ] **Step 3: 创建组件模板**

```xml
<view class="nav-bar" style="padding-top: {{statusBarHeight}}px; background: {{background}};">
  <view class="nav-bar__inner">
    <view class="nav-bar__back" bindtap="onBack" wx:if="{{back}}">
      <van-icon name="arrow-left" size="40rpx" color="#fff" />
    </view>
    <view class="nav-bar__placeholder" wx:else></view>
    <text class="nav-bar__title">{{title}}</text>
    <view class="nav-bar__right">
      <slot name="right"></slot>
    </view>
  </view>
</view>
```

保存到 `components/custom-nav-bar/custom-nav-bar.wxml`

- [ ] **Step 4: 创建组件样式**

```css
.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  background: linear-gradient(135deg, #FF9800, #FFB74D);
}

.nav-bar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 32rpx;
}

.nav-bar__back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-bar__placeholder {
  width: 60rpx;
}

.nav-bar__title {
  flex: 1;
  text-align: center;
  font-size: 36rpx;
  font-weight: 600;
  color: #fff;
}

.nav-bar__right {
  width: 60rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
```

保存到 `components/custom-nav-bar/custom-nav-bar.wxss`

- [ ] **Step 5: 创建组件逻辑**

```javascript
Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    background: {
      type: String,
      value: 'linear-gradient(135deg, #FF9800, #FFB74D)'
    }
  },

  data: {
    statusBarHeight: 0
  },

  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync()
      this.setData({
        statusBarHeight: systemInfo.statusBarHeight
      })
    }
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
    }
  }
})
```

保存到 `components/custom-nav-bar/custom-nav-bar.js`

- [ ] **Step 6: 提交组件**

```bash
git add components/custom-nav-bar/
git commit -m "feat: add custom-nav-bar component"
```

---

## Task 3: 创建empty-state组件

**Files:**
- Create: `components/empty-state/empty-state.wxml`
- Create: `components/empty-state/empty-state.wxss`
- Create: `components/empty-state/empty-state.js`
- Create: `components/empty-state/empty-state.json`

- [ ] **Step 1: 创建组件目录**

```bash
mkdir -p components/empty-state
```

- [ ] **Step 2: 创建组件配置文件**

```json
{
  "component": true,
  "usingComponents": {
    "van-icon": "@vant/weapp/icon/index",
    "van-button": "@vant/weapp/button/index"
  }
}
```

保存到 `components/empty-state/empty-state.json`

- [ ] **Step 3: 创建组件模板**

```xml
<view class="empty-state">
  <van-icon name="{{icon}}" size="120rpx" color="#ccc" />
  <text class="empty-state__text">{{text}}</text>
  <van-button wx:if="{{button}}" type="primary" size="small" round bindtap="onAction">
    {{button}}
  </van-button>
</view>
```

保存到 `components/empty-state/empty-state.wxml`

- [ ] **Step 4: 创建组件样式**

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.empty-state__text {
  margin-top: 32rpx;
  font-size: 28rpx;
  color: #999;
}

.empty-state .van-button {
  margin-top: 32rpx;
}
```

保存到 `components/empty-state/empty-state.wxss`

- [ ] **Step 5: 创建组件逻辑**

```javascript
Component({
  properties: {
    icon: {
      type: String,
      value: 'search'
    },
    text: {
      type: String,
      value: '暂无数据'
    },
    button: {
      type: String,
      value: ''
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
```

保存到 `components/empty-state/empty-state.js`

- [ ] **Step 6: 提交组件**

```bash
git add components/empty-state/
git commit -m "feat: add empty-state component"
```

---

## Task 4: 创建review-popup组件

**Files:**
- Create: `components/review-popup/review-popup.wxml`
- Create: `components/review-popup/review-popup.wxss`
- Create: `components/review-popup/review-popup.js`
- Create: `components/review-popup/review-popup.json`

- [ ] **Step 1: 创建组件目录**

```bash
mkdir -p components/review-popup
```

- [ ] **Step 2: 创建组件配置文件**

```json
{
  "component": true,
  "usingComponents": {
    "van-popup": "@vant/weapp/popup/index",
    "van-rate": "@vant/weapp/rate/index",
    "van-field": "@vant/weapp/field/index",
    "van-button": "@vant/weapp/button/index"
  }
}
```

保存到 `components/review-popup/review-popup.json`

- [ ] **Step 3: 创建组件模板**

```xml
<van-popup show="{{show}}" position="bottom" round bind:close="onClose">
  <view class="review-popup">
    <view class="review-popup__header">
      <text class="review-popup__title">评价订单</text>
      <van-icon name="cross" size="40rpx" bindtap="onClose" />
    </view>
    <view class="review-popup__content">
      <view class="review-popup__rating">
        <text class="review-popup__label">服务评分</text>
        <van-rate value="{{rating}}" bind:change="onRatingChange" />
      </view>
      <van-field
        value="{{content}}"
        type="textarea"
        placeholder="请输入您的评价内容..."
        bind:input="onContentInput"
        maxlength="200"
        show-word-limit
      />
    </view>
    <view class="review-popup__footer">
      <van-button type="primary" block round bindtap="onSubmit">提交评价</van-button>
    </view>
  </view>
</van-popup>
```

保存到 `components/review-popup/review-popup.wxml`

- [ ] **Step 4: 创建组件样式**

```css
.review-popup {
  padding: 32rpx;
}

.review-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.review-popup__title {
  font-size: 32rpx;
  font-weight: 600;
}

.review-popup__content {
  margin-bottom: 32rpx;
}

.review-popup__rating {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.review-popup__label {
  margin-right: 16rpx;
  font-size: 28rpx;
}

.review-popup__footer {
  margin-top: 32rpx;
}
```

保存到 `components/review-popup/review-popup.wxss`

- [ ] **Step 5: 创建组件逻辑**

```javascript
Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    orderId: {
      type: String,
      value: ''
    }
  },

  data: {
    rating: 5,
    content: ''
  },

  methods: {
    onRatingChange(e) {
      this.setData({ rating: e.detail })
    },

    onContentInput(e) {
      this.setData({ content: e.detail })
    },

    onClose() {
      this.setData({ rating: 5, content: '' })
      this.triggerEvent('close')
    },

    onSubmit() {
      const { rating, content, orderId } = this.data
      if (!content.trim()) {
        wx.showToast({ title: '请输入评价内容', icon: 'none' })
        return
      }
      this.triggerEvent('submit', { orderId, rating, content })
      this.setData({ rating: 5, content: '' })
    }
  }
})
```

保存到 `components/review-popup/review-popup.js`

- [ ] **Step 6: 提交组件**

```bash
git add components/review-popup/
git commit -m "feat: add review-popup component"
```

---

## Task 5: 更新变量系统

**Files:**
- Modify: `variable.less`
- Modify: `app.wxss`

- [ ] **Step 1: 读取现有variable.less**

```bash
cat variable.less
```

- [ ] **Step 2: 更新variable.less变量定义**

```less
// 品牌色
@primary-color: #FF9800;
@secondary-color: #FFB74D;

// 背景色
@bg-color: #FFF8F0;
@bg-color-gray: #f5f5f5;

// 文本颜色
@text-color: #3D2C1E;
@text-secondary: #666666;
@text-placeholder: #999999;

// 边框颜色
@border-color: #EEEEEE;

// 状态颜色
@success-color: #4CAF50;
@warning-color: #FF9800;
@error-color: #F44336;

// 原有变量（保持兼容）
@brand7-normal: #0052d9;
```

保存到 `variable.less`

- [ ] **Step 3: 读取现有app.wxss**

```bash
cat app.wxss
```

- [ ] **Step 4: 在app.wxss中添加CSS变量**

在app.wxss的`page`选择器中添加：

```css
page {
  --primary-color: #FF9800;
  --secondary-color: #FFB74D;
  --bg-color: #FFF8F0;
  --bg-color-gray: #f5f5f5;
  --text-color: #3D2C1E;
  --text-secondary: #666666;
  --text-placeholder: #999999;
  --border-color: #EEEEEE;
  --success-color: #4CAF50;
  --warning-color: #FF9800;
  --error-color: #F44336;
}
```

- [ ] **Step 5: 提交变量更新**

```bash
git add variable.less app.wxss
git commit -m "feat: update design variables system"
```

---

## Task 6: 注册组件到app.json

**Files:**
- Modify: `app.json`

- [ ] **Step 1: 读取现有app.json**

```bash
cat app.json
```

- [ ] **Step 2: 在usingComponents中添加组件**

在app.json的`usingComponents`中添加：

```json
{
  "usingComponents": {
    "custom-nav-bar": "/components/custom-nav-bar/custom-nav-bar",
    "empty-state": "/components/empty-state/empty-state",
    "review-popup": "/components/review-popup/review-popup"
  }
}
```

- [ ] **Step 3: 提交配置更新**

```bash
git add app.json
git commit -m "feat: register custom components in app.json"
```

---

## Task 7: 清理异常文件

**Files:**
- Delete: `packagePet/pages/pet/pet.wxml.wxml`

- [ ] **Step 1: 检查异常文件**

```bash
ls -la packagePet/pages/pet/pet.wxml.wxml
```

Expected: 文件存在

- [ ] **Step 2: 删除异常文件**

```bash
rm packagePet/pages/pet/pet.wxml.wxml
```

- [ ] **Step 3: 验证删除结果**

```bash
ls -la packagePet/pages/pet/
```

Expected: pet.wxml.wxml文件不存在

- [ ] **Step 4: 提交删除操作**

```bash
git add packagePet/pages/pet/
git commit -m "fix: remove duplicate pet.wxml.wxml file"
```

---

## Task 8: 在orders页面使用新组件

**Files:**
- Modify: `pages/orders/orders.wxml`
- Modify: `pages/orders/orders.json`

- [ ] **Step 1: 读取orders页面文件**

```bash
cat pages/orders/orders.wxml
cat pages/orders/orders.json
```

- [ ] **Step 2: 更新orders.json注册组件**

在orders.json的`usingComponents`中添加：

```json
{
  "usingComponents": {
    "review-popup": "/components/review-popup/review-popup",
    "empty-state": "/components/empty-state/empty-state"
  }
}
```

- [ ] **Step 3: 替换评价弹窗代码**

删除orders.wxml中第120-142行的评价弹窗代码，替换为：

```xml
<review-popup show="{{showReview}}" orderId="{{currentOrderId}}" bind:submit="onSubmitReview" bind:close="onCloseReview" />
```

- [ ] **Step 4: 添加空状态组件**

在订单列表为空时显示：

```xml
<empty-state wx:if="{{orders.length === 0}}" icon="orders-o" text="暂无订单" button="去下单" bind:action="goToIndex" />
```

- [ ] **Step 5: 提交更新**

```bash
git add pages/orders/orders.wxml pages/orders/orders.json
git commit -m "refactor: use review-popup and empty-state components in orders page"
```

---

## Task 9: 在order-detail页面使用新组件

**Files:**
- Modify: `pages/order-detail/order-detail.wxml`
- Modify: `pages/order-detail/order-detail.json`

- [ ] **Step 1: 读取order-detail页面文件**

```bash
cat pages/order-detail/order-detail.wxml
cat pages/order-detail/order-detail.json
```

- [ ] **Step 2: 更新order-detail.json注册组件**

在order-detail.json的`usingComponents`中添加：

```json
{
  "usingComponents": {
    "review-popup": "/components/review-popup/review-popup"
  }
}
```

- [ ] **Step 3: 替换评价弹窗代码**

删除order-detail.wxml中第240-262行的评价弹窗代码，替换为：

```xml
<review-popup show="{{showReview}}" orderId="{{order._id}}" bind:submit="onSubmitReview" bind:close="onCloseReview" />
```

- [ ] **Step 4: 提交更新**

```bash
git add pages/order-detail/order-detail.wxml pages/order-detail/order-detail.json
git commit -m "refactor: use review-popup component in order-detail page"
```

---

## Task 10: 验证和测试

**Files:**
- Test: 所有修改的页面

- [ ] **Step 1: 检查所有页面样式**

在微信开发者工具中预览以下页面，确认样式正常：
- pages/admin/*
- pages/agency-detail/*
- pages/agency-register/*
- pages/browse-agencies/*
- pages/browse-services/*
- pages/health-add/*
- pages/order-detail/*
- pages/payment/*
- pages/pet-detail/*
- packagePet/pages/pet/*

- [ ] **Step 2: 测试组件功能**

测试以下组件功能：
- custom-nav-bar: 返回按钮、标题显示
- empty-state: 图标、文字、按钮显示
- review-popup: 弹窗显示、评分、提交

- [ ] **Step 3: 测试页面交互**

测试以下页面交互：
- orders页面: 评价弹窗功能
- order-detail页面: 评价弹窗功能

- [ ] **Step 4: 检查代码重复率**

```bash
# 统计组件使用情况
grep -r "custom-nav-bar" pages/ | wc -l
grep -r "empty-state" pages/ | wc -l
grep -r "review-popup" pages/ | wc -l
```

Expected: 组件被多处使用

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: complete UI optimization batch 1 - code quality and maintainability"
```

---

## 验收标准

1. ✅ 14个页面的.wxss文件生成，样式正常显示
2. ✅ 创建custom-nav-bar、empty-state、review-popup组件
3. ✅ 统一变量系统，CSS变量和Less变量定义完成
4. ✅ 评价弹窗代码重复问题解决
5. ✅ pet.wxml.wxml异常文件删除
6. ✅ 组件在orders和order-detail页面成功使用
7. ✅ 所有页面功能正常，无回归问题

---

## 后续优化

完成第一批优化后，将进行第二批优化：视觉一致性，包括：
- 统一px/rpx单位使用
- 检查导航栏配置
- 统一背景色
- 统一安全区处理