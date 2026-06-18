# AGENTS.md — AI 助手上下文指南

> 最后更新：2026-06-16
> 本文件面向接手的 AI 编码助手。阅读本文件后，请遵循以下约定开展工作。

---

## 重要：执行任务前必须阅读文档

**每次执行任务前，AI 必须先阅读以下文档：**

1. `docs/设计规范.md` — UI/UX 设计规范和品牌标准
2. `docs/开发规范.md` — 代码编写规范和最佳实践
3. `docs/页面功能说明.md` — 所有页面的详细功能说明
4. `docs/项目结构文档.md` — 项目架构和技术栈
5. `docs/任务执行文档.md` — 当前任务状态和待办事项

---

## 项目定位

**就宠你** — 微信小程序宠物智能服务平台。
- 宠物主人：浏览机构/服务、在线下单、管理宠物档案、健康管理、智能匹配
- 服务机构：发布服务、接单、笼位管理、收入统计、评价管理
- 管理员：审核机构入驻、平台数据看板、API 配置

---

## 技术栈（不可更改）

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML + WXSS + JS） |
| UI 库 | **Vant Weapp** ^1.11.7 |
| 样式 | **Less 预处理器**（编辑 `.less` 文件，编译后生成 `.wxss`） |
| 后端 | 微信云开发（云数据库 + 云存储 + 云函数） |
| 认证 | 微信一键登录 + 账号密码双模式 |

**品牌色**：`#FF9800`（暖橙色）。所有高亮、按钮、标签统一使用此色。

---

## 服务分类（4 类）

```
foster       → 宠物寄养
grooming     → 美容洗护
medical      → 医疗健康
door         → 上门服务
```

---

## 目录速查

```
cloudfunctions/
  ai_handler/        → 统一云函数入口（20+ action）
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
  smart-match/       → 智能匹配（AI + 同义词扩展 + 评分）
  order-detail/      → 订单详情
  payment/           → 支付页
  profile/           → 个人资料编辑
  pet-detail/        → 宠物详情
  health/            → 健康管理（含 AI 风险预警）
  health-add/        → 添加健康记录
  balance/           → 余额管理
  ai/                → AI 创作（空壳，待开发）
  agency/            → 机构首页
  agency-register/   → 机构注册
  agency-edit/       → 机构资料编辑
  agency-orders/     → 机构订单管理
  agency-services/   → 机构服务管理
  agency-services-add/ → 添加/编辑服务
  agency-revenue/    → 收入统计
  agency-reviews/    → 评价管理
  agency-pets/       → 笼位管理 + 寄养宠物管理
  agency-posts/      → 机构帖子接单
  agency-pet-detail/ → 机构端宠物详情
  admin/             → 管理后台
  admin/audit        → 机构审核
  admin/audit-detail → 审核详情
  admin/agencies     → 机构列表管理
  admin/dashboard    → 平台数据看板
  admin/api-config   → API 配置管理
packagePet/pages/pet/ → 宠物档案管理（子包）
static/
  pet/               → logo、空状态图
  Avatar/            → 用户头像
  tab-*.png          → TabBar 图标
```

---

## 编码铁律

### 1. 样式文件：必须编辑 .less，不能编辑 .wxss
项目使用 Less 预处理器。`.wxss` 文件由 `.less` 编译生成，直接编辑 `.wxss` 会在下次编译时被覆盖。

编译命令：`npx lessc pages/xxx/xxx.less pages/xxx/xxx.wxss`

### 2. 导航栏：统一自定义导航栏
- `navigationStyle: "custom"` 在页面 `.json` 中设置
- 使用 `getStatusBarHeight()` 工具函数获取状态栏高度
- 导航栏背景：`linear-gradient(135deg, #FF9800, #FFB74D, #FF8A65)`
- 标题样式：白色、700 粗体、居中（全局 `.nav-bar__title` 已定义）

### 3. Tab 页面导航：必须用 switchTab
底部 TabBar 页面（index、orders、my）**只能用 `wx.switchTab()`**，不能用 `wx.navigateTo()` 或 `wx.redirectTo()`。

### 4. 云函数：机构端写操作必须通过云函数
机构端的数据库写操作（订单状态更新、笼位分配、评价回复等）必须通过云函数 `ai_handler` 执行，绕过客户端安全规则。

可用的机构端 action：
- `update_order_status`：更新订单状态（含笼位校验）
- `update_order_cage`：更新笼位号
- `update_order_reply`：回复评价
- `create_agency_order`：从帖子创建订单

### 5. 事件传播：catchtap 阻止冒泡
在可点击卡片内部的操作按钮上使用 `catchtap` 而非 `bindtap`。

### 6. 图片模式约定
| 场景 | mode |
|------|------|
| logo / 占位图 / 预设头像 | `aspectFit` |
| 用户上传的照片 / 机构环境图 | `aspectFill` |

### 7. 云文件处理
云存储的文件 ID 以 `cloud://` 开头，需通过 `utils/fileHelper.js` 的 `resolveTempUrls()` 转为临时 HTTP URL。

### 8. 异步操作超时控制
所有云数据库查询和云函数调用必须使用 `withTimeout()` 包装：
```javascript
const res = await withTimeout(
  db.collection('collection').get(),
  8000
);
```

### 9. 模板表达式限制
微信小程序模板不支持复杂表达式（如 `.indexOf()`）。需要在 JS 中预处理数据。

### 10. Vant 组件布局
`van-button` 等自定义组件不能直接 `flex:1`，需用 `view` 包裹。

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
pending      → 待接单
confirmed    → 已接单
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
''               → 空闲
```

### 服务分类（agency_services.category）
```
foster       → 宠物寄养
grooming     → 美容洗护
medical      → 医疗健康
door         → 上门服务
```

---

## 已知技术债务

| 问题 | 位置 | 说明 |
|------|------|------|
| AI 创作页面为空壳 | `pages/ai/ai` | 待开发实际功能 |
| 机构评分为静态字段 | `agency_profiles.score` | 应根据用户评价动态计算 |
| 省市映射不完整 | `smart-match.js` | 仅覆盖 31 省主要城市 |

---

## 提交前检查清单

- [ ] 是否已阅读 `docs/` 文件夹中的相关文档？
- [ ] 样式修改是否在 `.less` 文件中进行？
- [ ] Tab 页面间的导航是否使用了 `wx.switchTab()`？
- [ ] 机构端写操作是否通过云函数执行？
- [ ] 卡片内操作按钮是否使用了 `catchtap` 防止冒泡？
- [ ] 云数据库查询是否使用了 `withTimeout()` 包装？
- [ ] 图片 `mode` 是否符合约定？
- [ ] 是否引入了新的 npm 依赖？

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `docs/项目结构文档.md` | 项目架构、技术栈、数据库、云函数 |
| `docs/页面功能说明.md` | 所有页面的功能、数据结构和交互逻辑 |
| `docs/智能匹配算法文档.md` | 智能匹配算法详解 |
| `docs/智能匹配页面跳转流程.md` | 智能匹配跳转流程 |
| `docs/任务执行文档.md` | 任务跟踪、已完成/待办事项 |
| `docs/开发规范.md` | 代码编写规范 |
| `docs/设计规范.md` | UI/UX 设计规范 |
