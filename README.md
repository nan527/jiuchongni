<div align="center">

<img src="static/pet/logo.png" width="120" height="120" alt="就宠你 Logo" style="border-radius: 20px;">

<br/>
<br/>

```
     ██╗ ██████╗ ███╗   ██╗
     ██║██╔═══██╗████╗  ██║
     ██║██║   ██║██╔██╗ ██║
██   ██║██║   ██║██║╚██╗██║
╚█████╔╝╚██████╔╝██║ ╚████║
 ╚════╝  ╚═════╝ ╚═╝  ╚═══╝
    就 宠 你 · JCN
```

# 🐾 就宠你

### 宠物智能服务平台

![WeChat Mini Program](https://img.shields.io/badge/WeChat%20Mini%20Program-07C160?style=for-the-badge&logo=wechat&logoColor=white)
![Cloud Development](https://img.shields.io/badge/Cloud%20Development-4A90D9?style=for-the-badge&logoColor=white)
![AI Powered](https://img.shields.io/badge/AI%20Powered-FF6B6B?style=for-the-badge&logo=openai&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

<p align="center">
  一款面向宠物主人和宠物服务机构的一站式微信小程序<br/>
  提供宠物寄养、美容洗护、医疗健康、上门服务等全场景服务
</p>

---

**🏆 山西大学计算机与信息技术学院 · 2026 届制作团队**

[快速开始](#-快速开始) · [核心功能](#-核心功能) · [技术架构](#-技术架构) · [项目结构](#-项目结构) · [文档](#-文档)

</div>

---

## 📖 项目简介

**就宠你** 是一个基于微信云开发的宠物服务生态平台，通过 **AI 智能匹配算法** 连接宠物主人与服务机构，实现服务需求的精准对接。平台支持三大角色体系，覆盖宠物服务全生命周期。

### 🎯 设计理念

- **智能化** — AI 驱动的需求理解与服务匹配
- **一站式** — 寄养、美容、医疗、上门服务全覆盖
- **多角色** — 宠物主人、服务机构、平台管理员协同
- **云原生** — 微信云开发，零服务器运维

---

## ✨ 核心功能

### 🤖 AI 智能匹配

> 自然语言输入，智能解析需求

```
用户输入: "在太原寄养一天，100元左右，要有监控"
    ↓
AI 解析: { 地区: "太原", 服务: "寄养", 预算: 100, 关键词: "监控" }
    ↓
同义词扩展 + 语义匹配
    ↓
返回 TOP-N 推荐结果（100分制评分 + 四档颜色标识）
```

### 🏥 宠物健康管理

- 📊 健康状态可视化（体重、疫苗、驱虫）
- 📈 体重趋势追踪
- 💉 疫苗/驱虫时间线管理
- 🚨 AI 健康风险预警

### 📋 订单全生命周期

```
创建订单 → 支付 → 接单 → 服务中 → 完成 → 评价
    ↓         ↓       ↓        ↓        ↓       ↓
 倒计时    待支付   待接单    进行中   待确认   评分
```

### 🏠 机构智能管理

- 📦 笼位网格化管理，防止超售
- 💰 收入统计看板
- ⭐ 评价回复管理
- 📝 帖子接单功能

---

## 👥 三大角色体系

<table>
<tr>
<td width="33%" align="center">

### 🐕 宠物主人

浏览机构/服务  
在线预约下单  
宠物档案管理  
健康数据分析  
智能服务匹配

</td>
<td width="33%" align="center">

### 🏢 服务机构

发布服务项目  
接单/订单管理  
笼位资源管理  
收入数据统计  
评价互动管理

</td>
<td width="33%" align="center">

### 👨‍💼 平台管理员

审核机构入驻  
平台数据看板  
API 接口配置  
系统运维监控

</td>
</tr>
</table>

---

## 🛠️ 技术架构

<div align="center">

```
┌─────────────────────────────────────────────────────────────┐
│                      微信小程序前端                          │
│         WXML + WXSS + JavaScript + Vant Weapp               │
├─────────────────────────────────────────────────────────────┤
│                     业务逻辑层                               │
│              Services + Utils + Constants                    │
├─────────────────────────────────────────────────────────────┤
│                   微信云开发后端                              │
│        Cloud Functions + Cloud Database + Cloud Storage      │
├─────────────────────────────────────────────────────────────┤
│                    AI 服务层                                 │
│           自然语言处理 + 智能匹配 + 健康分析                  │
└─────────────────────────────────────────────────────────────┘
```

</div>

### 技术栈详情

| 层级 | 技术选型 | 说明 |
|:----:|:--------:|:-----|
| 🎨 **前端** | 微信小程序原生 | WXML + WXSS + JavaScript |
| 🎯 **UI 组件** | Vant Weapp ^1.11.7 | 有赞移动端组件库 |
| 🎨 **样式** | Less | CSS 预处理器，支持变量、混入 |
| ⚡ **后端** | 微信云开发 | Serverless 架构，零运维 |
| 🔐 **认证** | 双模式登录 | 微信授权 + 账号密码 |
| 🤖 **AI** | 自定义算法 | 语义理解 + 智能匹配引擎 |

### 服务分类矩阵

| 服务类型 | 图标 | 场景描述 |
|:--------:|:----:|:---------|
| 🏠 **宠物寄养** | `foster` | 日托 / 长托 / 隔离寄养 |
| ✂️ **美容洗护** | `grooming` | 洗澡 / 造型 / SPA |
| 🏥 **医疗健康** | `medical` | 体检 / 疫苗 / 治疗 |
| 🚪 **上门服务** | `door` | 遛狗 / 喂食 / 上门洗护 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 | 用途 |
|:----:|:--------:|:-----|
| 📱 微信开发者工具 | 最新版 | 小程序开发调试 |
| 💻 Node.js | >= 14 | npm 依赖管理 |
| 📦 微信基础库 | >= 3.15.1 | 运行环境 |

### 安装步骤

```bash
# Step 1️⃣ 克隆项目
git clone <your-repo-url>
cd jcn

# Step 2️⃣ 安装依赖
npm install

# Step 3️⃣ 构建 npm（在微信开发者工具中）
# 工具栏 → 工具 → 构建 npm

# Step 4️⃣ 配置云环境
# 编辑 app.js，修改 env 为你的云环境 ID

# Step 5️⃣ 部署云函数
# 右键 cloudfunctions/ai_handler → 上传并部署：云端安装依赖
```

### 数据库集合清单

```javascript
// 核心业务集合
users              // 👤 用户账号信息
agency_profiles    // 🏢 机构档案
pets               // 🐕 宠物档案
user_orders        // 📋 订单记录
agency_services    // 🛎️ 机构服务

// 健康管理集合
health_records     // 💊 健康记录
health_risk_records // ⚠️ AI 风险记录

// 系统配置集合
api_configs        // 🔑 API 配置
user_balances      // 💰 用户余额
balance_logs       // 📝 余额变动日志
```

---

## 📁 项目结构

```
jcn/
├── 📄 app.js                        # 应用入口
├── 📄 app.json                      # 全局配置
├── 📄 app.less                      # Less 变量定义
│
├── ☁️  cloudfunctions/               # 云函数目录
│   └── ai_handler/                  #   └── 统一云函数入口 (20+ actions)
│
├── 🧩 components/                   # 自定义组件库
├── 📚 constants/                    # 常量定义
├── ⚙️  services/                     # 业务服务层
├── 🔧 utils/                        # 工具函数集
│
├── 📱 pages/                        # 页面目录
│   ├── 🏠 index/                    #   ├── 首页 (Tab)
│   ├── 📋 orders/                   #   ├── 订单中心 (Tab)
│   ├── 👤 my/                       #   ├── 个人中心 (Tab)
│   ├── 🤖 smart-match/             #   ├── 智能匹配
│   ├── 🏥 health/                   #   ├── 健康管理
│   ├── 🏢 agency/                   #   ├── 机构详情
│   ├── ⚙️  admin/                    #   └── 管理后台
│   └── ...
│
├── 📦 packagePet/                   # 宠物档案子包（分包加载）
├── 🖼️  static/                      # 静态资源
├── 📝 docs/                         # 项目文档
└── 📦 miniprogram_npm/              # npm 构建产物
```

---

## 📚 文档

<table>
<tr>
<td width="50%">

### 📖 开发文档

| 文档 | 描述 |
|:-----|:-----|
| [项目结构文档](docs/项目结构文档.md) | 架构、技术栈、数据库设计 |
| [页面功能说明](docs/页面功能说明.md) | 全部页面功能详解 |
| [智能匹配算法](docs/智能匹配算法文档.md) | AI 匹配引擎实现 |

</td>
<td width="50%">

### 🎨 规范文档

| 文档 | 描述 |
|:-----|:-----|
| [开发规范](docs/开发规范.md) | 代码编写标准 |
| [设计规范](docs/设计规范.md) | UI/UX 设计指南 |
| [任务执行文档](docs/任务执行文档.md) | 项目任务跟踪 |

</td>
</tr>
</table>

---

## 🌟 特性亮点

| 特性 | 说明 |
|:----:|:-----|
| 🚀 **极致性能** | 分包加载 + 按需渲染，首屏秒开 |
| 🔒 **安全可靠** | 微信云开发原生安全，数据加密传输 |
| 🎯 **智能匹配** | NLP 需求解析 + 同义词扩展 + 语义评分 |
| 📱 **原生体验** | 原生小程序开发，流畅丝滑 |
| 🧩 **组件化** | 高复用组件库，开发效率提升 50% |
| ☁️ **云原生** | Serverless 架构，自动弹性伸缩 |

---

## 📄 开源协议

本项目基于 **MIT License** 开源。

```
MIT License

Copyright (c) 2026 山西大学计算机与信息技术学院 · 就宠你开发团队

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

### 🐾 就宠你 — 让宠物服务更智能

**山西大学计算机与信息技术学院 · 2026 届制作团队**

![GitHub Stars](https://img.shields.io/github/stars/your-username/jcn?style=social)
![GitHub Forks](https://img.shields.io/github/forks/your-username/jcn?style=social)

</div>
