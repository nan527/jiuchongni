# AGENTS.md — AI 助手上下文指南

> 本文件面向接手的 AI 编码助手。阅读本文件后，请遵循以下约定开展工作。

---

## 项目定位

**就宠你** — 微信小程序宠物智能服务平台。
- 宠物主人：发布/预约寄养领养、管理宠物档案
- 服务机构：发布服务、接单、笼位管理、收入统计
- 管理员：审核机构入驻

---

## 技术栈（不可更改）

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML + WXSS + JS） |
| UI 库 | **Vant Weapp**（全局已注册常用组件） |
| 后端 | 微信云开发（云数据库 + 云存储 + 云函数） |
| 认证 | 微信一键登录 + 账号密码双模式 |

**品牌色**：`#FF9800`（暖橙色）。所有高亮、按钮、标签统一使用此色。

---

## 目录速查

```
cloudfunctions/      → 云函数
constants/index.js   → 角色、订单状态、宠物状态等常量
services/
  authService.js     → 登录/注册/会话（核心）
  userService.js     → 用户服务
pages/
  index/             → 首页服务广场
  pet/               → 宠物档案（含25种预设头像弹层）
  foster-center/     → 寄养领养中心
  service-detail/    → 服务详情 + 预约
  orders/            → 用户订单中心
  agency/            → 机构首页
  agency-orders/     → 机构订单管理
  agency-revenue/    → 机构收入统计
  login/             → 登录页
  my/                → 个人中心
static/
  Avatar/pet/        → 25个预设宠物头像（已加入 .gitignore）
  pet/logo.png       → 全局默认占位图（所有旧 /static/logo.png 已替换）
```

> ⚠️ 以下目录为 **TDesign 模板遗留空壳**，当前未使用：  
> `chat/ dataCenter/ home/ match/ health/ ai/ message/ release/ search/ setting/ loginCode/`

---

## 关键业务常量

### 宠物状态（pets.petStatus）
```
pending_foster   → 待寄养
agency_foster    → 机构寄养中
waiting_pickup   → 待取回
''               → 空闲（无寄养订单）
```

### 订单状态（orders.status）
```
pending      → 待确认
confirmed    → 已确认
in_progress  → 进行中
to_confirm   → 待确认取回
completed    → 已完成
cancelled    → 已取消
```

**状态同步规则**：机构更新订单状态后，应同步更新对应宠物的 `petStatus`。

---

## 编码铁律

### 1. UI 组件：优先使用 Vant
已全局注册的组件：`van-button` `van-field` `van-cell-group` `van-uploader` `van-popup` `van-tag` `van-icon` `van-loading` `van-image` `van-tabbar` 等。

如需新组件，先在目标页面的 `.json` 中注册，**不要在 `app.json` 中重复全局注册**。

### 2. 样式：行内 style 优先于 WXSS
WeChat Mini Program 对 WXSS 的 `flex` `gap` `calc()` 等解析不稳定。参考以下经验：
- **登录页标签**和**宠物头像弹层**曾因 WXSS 失效，最终改用 `style="display:flex;..."` 行内样式解决
- 布局类样式（flex 排列、宽度分配）**必须**写行内 `style`
- 颜色、字体大小等装饰性样式可放 WXSS

### 3. 图片模式约定
| 场景 | mode |
|------|------|
| logo / 占位图 / 预设头像 | `aspectFit`（完整显示，不裁切） |
| 用户上传的宠物照片 | `aspectFill`（填充裁切，保持比例） |

### 4. 静态资源
- `static/Avatar/pet/` 目录已加入 `.gitignore`，**不要提交**
- 所有默认图统一用 `/static/pet/logo.png`（旧 `/static/logo.png` 已全局替换完毕）

---

## 已知 Bug（高优）

### Bug 1：宠物档案未按用户过滤
**位置**：`pages/pet/pet.js` → `loadPetList()`

当前代码：
```js
const res = await db.collection('pets')
  .orderBy('createTime', 'desc')
  .get();  // ❌ 没有 where 过滤！
```

**问题**：所有用户登录后都能看到全部宠物档案。
**根因**：微信登录用户用 `_openid` 字段，但账号密码登录用户没有这个字段，需要统一用户标识方案。
**修复方向**：在 `authService.js` 中确保所有用户（无论登录方式）都有统一的用户 ID 存储到 `app.globalData`，然后在 `loadPetList()` 中按此 ID 过滤。

---

## 历史变更（近期）

1. 登录页 UI 美化（渐变按钮、iOS 分段控件）
2. 全局替换 `/static/logo.png` → `/static/pet/logo.png`
3. 宠物档案新增25种预设头像选择弹层（5×5 网格，行内样式）
4. 寄养中心卡片图片比例修复（`aspectFill` → `aspectFit`）
5. README + LICENSE + 本文件创建

---

## 提交前检查清单

- [ ] 是否引入了新的 npm 依赖？（如需，更新 `package.json` 并执行构建 npm）
- [ ] 新页面是否注册了所需 Vant 组件？
- [ ] 布局是否测试了行内 style 作为 fallback？
- [ ] 图片 `mode` 是否符合约定？
- [ ] 是否修改了 `constants/index.js` 中的状态常量？（如有，同步更新所有引用处）
pages/pet-detail/pet-detail