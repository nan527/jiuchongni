# UI优化第二批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决4个视觉一致性问题，建立统一的视觉规范，提升品牌形象和用户体验。

**Architecture:** 统一单位使用、检查导航栏配置、统一背景色、统一安全区处理，建立视觉一致性规范。

**Tech Stack:** 微信小程序原生 + CSS变量

---

## 文件结构

### 修改文件
- `app.wxss` - 统一单位为rpx
- `pages/agency/agency.wxss` - 统一背景色
- 多个页面json文件 - 检查导航栏配置
- 多个页面wxml文件 - 统一安全区处理

---

## Task 1: 统一单位使用

**Files:**
- Modify: `app.wxss`

- [ ] **Step 1: 检查app.wxss中的px单位**

```bash
grep -n "px" app.wxss | head -20
```

Expected: 找出所有使用px的地方

- [ ] **Step 2: 读取app.wxss内容**

```bash
cat app.wxss
```

- [ ] **Step 3: 将px转换为rpx**

在app.wxss中，将所有px单位转换为rpx（1px = 2rpx）：

例如：
- `font-size: 20px;` → `font-size: 40rpx;`
- `border-radius: 8px;` → `border-radius: 16rpx;`
- `padding: 10px;` → `padding: 20rpx;`

- [ ] **Step 4: 验证转换结果**

```bash
grep -n "px" app.wxss | grep -v "rpx" | grep -v "/*"
```

Expected: 没有单独的px单位（排除注释中的px）

- [ ] **Step 5: 提交更新**

```bash
git add app.wxss
git commit -m "fix: unify units to rpx in app.wxss"
```

---

## Task 2: 检查导航栏配置

**Files:**
- Check: 所有页面的json配置文件

- [ ] **Step 1: 找出所有使用自定义导航栏的页面**

```bash
grep -r "custom-nav-bar" pages/ --include="*.wxml" -l
```

Expected: 列出使用custom-nav-bar组件的页面

- [ ] **Step 2: 检查这些页面的json配置**

对于每个使用自定义导航栏的页面，检查其json配置是否包含`"navigationStyle": "custom"`：

```bash
# 示例：检查orders页面
cat pages/orders/orders.json
```

- [ ] **Step 3: 修复配置问题**

如果页面使用了自定义导航栏但没有设置`navigationStyle: "custom"`，则添加该配置：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

- [ ] **Step 4: 提交更新**

```bash
git add pages/*/
git commit -m "fix: ensure navigationStyle custom for pages with custom nav bar"
```

---

## Task 3: 统一背景色

**Files:**
- Modify: `pages/agency/agency.wxss`

- [ ] **Step 1: 检查agency页面背景色**

```bash
grep -n "background" pages/agency/agency.wxss
```

Expected: 找到`background: #f5f5f5`或类似的灰色背景

- [ ] **Step 2: 读取agency.wxss内容**

```bash
cat pages/agency/agency.wxss
```

- [ ] **Step 3: 更新背景色**

将agency页面的背景色从`#f5f5f5`更新为`#FFF8F0`：

```css
page {
  background: #FFF8F0;
}
```

- [ ] **Step 4: 验证更新结果**

```bash
grep -n "background" pages/agency/agency.wxss
```

Expected: 背景色为#FFF8F0

- [ ] **Step 5: 提交更新**

```bash
git add pages/agency/agency.wxss
git commit -m "fix: unify agency page background to #FFF8F0"
```

---

## Task 4: 统一安全区处理

**Files:**
- Check: 多个页面的wxml文件
- Modify: 需要统一的页面

- [ ] **Step 1: 找出使用固定高度占位的页面**

```bash
grep -r "height: 40rpx" pages/ --include="*.wxml" -l
```

Expected: 列出使用固定高度占位的页面

- [ ] **Step 2: 找出使用safe-area-inset-bottom的页面**

```bash
grep -r "safe-area-inset-bottom" pages/ --include="*.wxml" -l
```

Expected: 列出使用safe-area-inset-bottom的页面

- [ ] **Step 3: 读取并分析页面结构**

对于使用固定高度占位的页面，读取其wxml文件，了解结构：

```bash
# 示例
cat pages/index/index.wxml | tail -20
```

- [ ] **Step 4: 统一安全区处理**

将固定高度占位替换为safe-area-inset-bottom：

```xml
<!-- 替换前 -->
<view style="height: 40rpx;"></view>

<!-- 替换后 -->
<view class="safe-area-bottom"></view>
```

在对应的wxss中添加：

```css
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 5: 提交更新**

```bash
git add pages/*/
git commit -m "fix: unify safe area handling across pages"
```

---

## Task 5: 验证和测试

**Files:**
- Test: 所有修改的页面

- [ ] **Step 1: 检查单位统一情况**

```bash
# 检查app.wxss中是否还有单独的px单位
grep -n "px" app.wxss | grep -v "rpx" | grep -v "/*"
```

Expected: 无输出（所有px已转换为rpx）

- [ ] **Step 2: 检查导航栏配置**

```bash
# 检查使用自定义导航栏的页面配置
for page in $(grep -r "custom-nav-bar" pages/ --include="*.wxml" -l); do
  dir=$(dirname "$page")
  json="$dir/$(basename "$dir").json"
  echo "检查 $json"
  grep "navigationStyle" "$json" || echo "  缺少 navigationStyle 配置"
done
```

Expected: 所有页面都有navigationStyle: custom

- [ ] **Step 3: 检查背景色一致性**

```bash
# 检查主要页面的背景色
grep -n "background" pages/index/index.wxss
grep -n "background" pages/orders/orders.wxss
grep -n "background" pages/my/my.wxss
grep -n "background" pages/agency/agency.wxss
```

Expected: 都使用#FFF8F0或var(--bg-color)

- [ ] **Step 4: 检查安全区处理**

```bash
# 检查是否还有固定高度占位
grep -r "height: 40rpx" pages/ --include="*.wxml"
```

Expected: 无输出（已统一处理）

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: complete UI optimization batch 2 - visual consistency"
```

---

## 验收标准

1. ✅ app.wxss中所有px单位转换为rpx
2. ✅ 使用自定义导航栏的页面配置正确
3. ✅ agency页面背景色统一为#FFF8F0
4. ✅ 安全区处理统一
5. ✅ 不同设备显示正常

---

## 后续优化

完成第二批优化后，将进行第三批优化：用户体验与交互，包括：
- 实现真正搜索功能
- 增加功能入口
- 优化布局方案
- 引入骨架屏加载
- 重构AI创作页面