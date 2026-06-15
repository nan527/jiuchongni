# 首页搜索功能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页搜索栏从跳转按钮改为真正的搜索输入框，支持实时搜索建议，提升搜索体验。

**Architecture:** 使用Vant Weapp的van-search组件替换原有搜索栏，添加实时搜索建议功能，优化搜索体验。

**Tech Stack:** 微信小程序原生 + Vant Weapp

---

## 文件结构

### 修改文件
- `pages/index/index.wxml` - 修改搜索栏为真正的输入框，添加搜索建议UI
- `pages/index/index.js` - 添加搜索逻辑和搜索建议功能
- `pages/index/index.wxss` - 添加搜索建议样式
- `pages/index/index.json` - 注册van-search组件（如未注册）

---

## Task 1: 修改首页搜索栏

**Files:**
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.json`

- [ ] **Step 1: 读取首页wxml文件**

```bash
cat pages/index/index.wxml
```

- [ ] **Step 2: 找到搜索栏代码**

搜索栏代码通常在第11-14行左右：
```xml
<view class="search-bar" bindtap="goToSearch">
  <van-icon name="search" size="36rpx" />
  <text class="search-placeholder">搜索机构或服务</text>
</view>
```

- [ ] **Step 3: 替换为van-search组件**

将搜索栏替换为：
```xml
<van-search
  value="{{searchKeyword}}"
  placeholder="搜索机构或服务"
  shape="round"
  background="transparent"
  bind:change="onSearchChange"
  bind:search="onSearch"
  bind:focus="onSearchFocus"
  bind:clear="onSearchClear"
  use-action-slot
>
  <view slot="action" bindtap="goToSearch">搜索</view>
</van-search>
```

- [ ] **Step 4: 添加搜索建议UI**

在搜索栏下方添加：
```xml
<!-- 搜索建议 -->
<view class="search-suggestions" wx:if="{{showSuggestions}}">
  <view 
    class="suggestion-item" 
    wx:for="{{searchSuggestions}}" 
    wx:key="_id"
    data-id="{{item._id}}"
    data-name="{{item.name}}"
    bindtap="onSuggestionTap"
  >
    <van-icon name="search" size="28rpx" color="#999" />
    <text class="suggestion-text">{{item.name}}</text>
    <text class="suggestion-address">{{item.address}}</text>
  </view>
</view>
```

- [ ] **Step 5: 检查并更新index.json**

```bash
cat pages/index/index.json
```

如果`usingComponents`中没有`van-search`，则添加：
```json
{
  "usingComponents": {
    "van-search": "@vant/weapp/search/index"
  }
}
```

- [ ] **Step 6: 提交wxml修改**

```bash
git add pages/index/index.wxml pages/index/index.json
git commit -m "feat: replace search bar with van-search component"
```

---

## Task 2: 添加搜索逻辑

**Files:**
- Modify: `pages/index/index.js`

- [ ] **Step 1: 读取首页js文件**

```bash
cat pages/index/index.js
```

- [ ] **Step 2: 添加搜索相关数据**

在`data`对象中添加：
```javascript
data: {
  // ... 现有数据
  searchKeyword: '',
  searchSuggestions: [],
  showSuggestions: false
}
```

- [ ] **Step 3: 添加搜索方法**

在`methods`对象中添加：
```javascript
// 搜索输入变化
onSearchChange(e) {
  const keyword = e.detail
  this.setData({ searchKeyword: keyword })
  
  // 如果有关键词，显示搜索建议
  if (keyword.trim()) {
    this.getSearchSuggestions(keyword)
  } else {
    this.setData({ showSuggestions: false })
  }
},

// 获取搜索建议
getSearchSuggestions(keyword) {
  // 从机构列表中筛选匹配的建议
  const suggestions = (this.data.agencies || []).filter(agency => 
    agency.name.includes(keyword) || 
    (agency.address && agency.address.includes(keyword))
  ).slice(0, 5)
  
  this.setData({ 
    searchSuggestions: suggestions,
    showSuggestions: suggestions.length > 0
  })
},

// 执行搜索
onSearch() {
  const { searchKeyword } = this.data
  if (searchKeyword.trim()) {
    wx.navigateTo({
      url: `/pages/browse-agencies/browse-agencies?keyword=${searchKeyword}`
    })
  }
},

// 搜索框获得焦点
onSearchFocus() {
  // 可选：显示搜索历史或热门搜索
},

// 清空搜索
onSearchClear() {
  this.setData({ 
    searchKeyword: '',
    showSuggestions: false 
  })
},

// 点击搜索建议
onSuggestionTap(e) {
  const { id } = e.currentTarget.dataset
  wx.navigateTo({
    url: `/pages/agency-detail/agency-detail?id=${id}`
  })
}
```

- [ ] **Step 4: 提交js修改**

```bash
git add pages/index/index.js
git commit -m "feat: add search logic with suggestions"
```

---

## Task 3: 添加搜索建议样式

**Files:**
- Modify: `pages/index/index.wxss`

- [ ] **Step 1: 读取首页wxss文件**

```bash
cat pages/index/index.wxss
```

- [ ] **Step 2: 添加搜索建议样式**

在wxss文件中添加：
```css
/* 搜索建议 */
.search-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 0 0 24rpx 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 400rpx;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-text {
  flex: 1;
  margin-left: 16rpx;
  font-size: 28rpx;
  color: #333;
}

.suggestion-address {
  font-size: 24rpx;
  color: #999;
  margin-left: 16rpx;
}
```

- [ ] **Step 3: 提交wxss修改**

```bash
git add pages/index/index.wxss
git commit -m "feat: add search suggestions styles"
```

---

## Task 4: 验证和测试

**Files:**
- Test: `pages/index/index.*`

- [ ] **Step 1: 检查文件完整性**

```bash
ls -la pages/index/
```

Expected: index.wxml, index.js, index.wxss, index.json都存在

- [ ] **Step 2: 检查van-search组件注册**

```bash
grep "van-search" pages/index/index.json
```

Expected: 找到van-search组件注册

- [ ] **Step 3: 检查搜索方法**

```bash
grep "onSearch" pages/index/index.js
```

Expected: 找到onSearch、onSearchChange等方法

- [ ] **Step 4: 检查搜索建议UI**

```bash
grep "search-suggestions" pages/index/index.wxml
```

Expected: 找到搜索建议的UI代码

- [ ] **Step 5: 检查搜索建议样式**

```bash
grep "search-suggestions" pages/index/index.wxss
```

Expected: 找到搜索建议的样式代码

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "feat: complete search functionality optimization"
```

---

## 验收标准

1. ✅ 首页搜索栏改为真正的输入框
2. ✅ 支持实时搜索建议（输入时显示推荐结果）
3. ✅ 点击搜索建议可跳转到机构详情
4. ✅ 点击搜索按钮可跳转到搜索结果页
5. ✅ 搜索框样式与设计语言一致
6. ✅ 性能无明显影响
7. ✅ 已提交到git

---

## 注意事项

1. **数据依赖**：搜索建议依赖首页加载的机构数据，确保`agencies`数据已加载
2. **性能优化**：如果机构数据量大，建议添加防抖（debounce）优化输入事件
3. **样式兼容**：确保van-search组件样式与现有设计语言一致
4. **用户体验**：保留点击跳转功能作为备选，搜索框提示文字引导用户输入