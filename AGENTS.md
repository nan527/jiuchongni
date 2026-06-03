# AGENTS.md — AI 助手上下文指南

> 本文件面向接手的 AI 编码助手。阅读本文件后，请遵循以下约定开展工作。

---

## 项目定位

**就宠你** — 微信小程序宠物智能服务平台。
- 宠物主人：浏览机构/服务、在线下单、管理宠物档案、健康分析
- 服务机构：发布服务、接单、笼位管理、收入统计、评价管理
- 管理员：审核机构入驻、平台数据看板

---

## 技术栈（不可更改）

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML + WXSS + JS） |
| UI 库 | **Vant Weapp** ^1.11.7（全局已注册常用组件） |
| 样式 | **Less 预处理器**（编辑 `.less` 文件，编译后生成 `.wxss`） |
| 后端 | 微信云开发（云数据库 + 云存储 + 云函数） |
| 认证 | 微信一键登录 + 账号密码双模式 |

**品牌色**：`#FF9800`（暖橙色）。所有高亮、按钮、标签统一使用此色。

---

## 目录速查

```
cloudfunctions/
  ai_handler/        → 统一云函数入口（10 个 action）
constants/index.js   → 角色、订单状态、存储键名等常量
services/
  authService.js     → 登录/注册/会话管理（核心）
utils/
  fileHelper.js      → 云文件临时 URL 解析
  helpers.js         → 共享工具函数（formatDate 等）
pages/
  index/             → 首页服务广场（Tab）
  orders/            → 用户订单中心（Tab）
  my/                → 个人中心（Tab）
  login/             → 登录页
  browse-agencies/   → 浏览机构列表
  browse-services/   → 浏览服务列表
  agency-detail/     → 机构详情
  service-detail/    → 服务详情 + 下单
  order-detail/      → 订单详情
  payment/           → 支付页
  profile/           → 个人资料编辑
  pet-detail/        → 宠物详情
  health/            → 健康管理
  match/             → 智能匹配
  ai/                → AI 创作（空壳）
  agency/            → 机构首页
  agency-register/   → 机构注册
  agency-edit/       → 机构资料编辑
  agency-orders/     → 机构订单管理
  agency-services/   → 机构服务管理
  agency-services-add/ → 添加/编辑服务
  agency-revenue/    → 收入统计
  agency-reviews/    → 评价管理
  agency-pets/       → 寄养宠物管理
  agency-posts/      → 机构动态
  admin/             → 管理后台
  admin/audit        → 机构审核
  admin/audit-detail → 审核详情
  admin/agencies     → 机构列表管理
  admin/dashboard    → 平台数据看板
packagePet/pages/pet/ → 宠物档案管理（子包）
static/
  pet/               → logo、联系图标、空状态图
  Avatar/            → 用户头像
  tab-*.png          → TabBar 图标
```

---

## 编码铁律

### 1. 样式文件：必须编辑 .less，不能编辑 .wxss
项目使用 Less 预处理器。`.wxss` 文件由 `.less` 编译生成，直接编辑 `.wxss` 会在下次编译时被覆盖。**所有样式修改必须在 `.less` 文件中进行。**

### 2. 导航栏：统一自定义导航栏
所有需要自定义导航栏的页面：
- `navigationStyle: "custom"` 在页面 `.json` 中设置
- 使用 `wx.getSystemInfoSync()` + `wx.getMenuButtonBoundingClientRect()` 计算高度
- 导航栏背景：`linear-gradient(135deg, #FF9800, #FFB74D)`
- 标题样式：白色、700 粗体、居中（全局 `.nav-bar__title` 已定义）

### 3. Tab 页面导航：必须用 switchTab
底部 TabBar 页面（index、orders、my）**只能用 `wx.switchTab()`**，不能用 `wx.navigateTo()` 或 `wx.redirectTo()`。

### 4. UI 组件：优先使用 Vant
已全局注册的组件：`van-button` `van-field` `van-cell-group` `van-uploader` `van-popup` `van-tag` `van-icon` `van-loading` `van-image` `van-tabbar` 等。

如需新组件，先在目标页面的 `.json` 中注册，**不要在 `app.json` 中重复全局注册**。

### 5. 事件传播：catchtap 阻止冒泡
在可点击卡片内部的操作按钮（如编辑、删除）上使用 `catchtap` 而非 `bindtap`，防止事件冒泡触发外层卡片的点击事件。

### 6. 图片模式约定
| 场景 | mode |
|------|------|
| logo / 占位图 / 预设头像 | `aspectFit`（完整显示，不裁切） |
| 用户上传的照片 / 机构环境图 | `aspectFill`（填充裁切，保持比例） |

### 7. 云数据库权限
- 客户端查询需用 `where({ _openid: '{openid}' })` 过滤当前用户数据
- 管理员操作（如审核、删除）需通过云函数绕过权限限制
- `user_orders` 集合中评价数据存储在 `review` 子字段（rating、content、createTime、reply）

### 8. 云文件处理
云存储的文件 ID 以 `cloud://` 开头，不能直接用于 `<image src>`。需通过 `utils/fileHelper.js` 的 `resolveTempUrls()` 转为临时 HTTP URL。

---

## 关键业务常量

### 角色（constants/index.js → ROLES）
```
pet_owner    → 宠物主人
agency       → 寄养机构
admin        → 平台管理员
```

### 订单状态（user_orders.orderStatus）
```
unpaid       → 待支付
pending      → 待确认
confirmed    → 已确认
in_progress  → 进行中
to_confirm   → 待确认取回
completed    → 已完成
cancelled    → 已取消
```

### 宠物状态（pets.petStatus）
```
pending_foster   → 待寄养
agency_foster    → 机构寄养中
waiting_pickup   → 待取回
''               → 空闲（无寄养订单）
```

### 服务分类（agency_services.category）
```
foster       → 宠物寄养
grooming     → 美容洗护
medical      → 医疗健康
door         → 上门服务
extra        → 商品增值
```

**状态同步规则**：机构更新订单状态后，应同步更新对应宠物的 `petStatus`。

---

## 已知技术债务

### 高优：宠物档案未按用户过滤
**位置**：`packagePet/pages/pet/pet.js` → `loadPetList()`

当前代码缺少 `_openid` 过滤条件，所有用户登录后都能看到全部宠物档案。需在查询中添加用户过滤。

### 高优：globalData.pet 未初始化
**位置**：`app.js` → `globalData`

健康页和匹配页依赖 `app.globalData.pet.currentPet`，但该值从未被设置。

### 中优：匹配算法未生效
**位置**：`pages/match/match.js` → `calculateMatch()`

硬编码 `match_score: 95`，未使用已定义的匹配函数。

### 低优：TDesign 组件残留引用
`components/card/` 和 `components/nav/` 引用 `tdesign-miniprogram` 但未安装、未被任何页面使用。可安全删除。

---

## 提交前检查清单

- [ ] 样式修改是否在 `.less` 文件中进行？（不要改 `.wxss`）
- [ ] Tab 页面间的导航是否使用了 `wx.switchTab()`？
- [ ] 新页面是否注册了所需 Vant 组件？
- [ ] 卡片内操作按钮是否使用了 `catchtap` 防止冒泡？
- [ ] 图片 `mode` 是否符合约定？
- [ ] 是否引入了新的 npm 依赖？（如需，更新 `package.json` 并执行构建 npm）
