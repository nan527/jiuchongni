# 机构详情页跳转逻辑说明

## 页面路径
```
/pages/agency-detail/agency-detail?id={机构_id}
```

## 参数说明
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 机构档案的 `_id`，来自 `agency_profiles` 集合 |

---

## 一、首页跳转

**文件**: `pages/index/index.js`

### 1.1 搜索结果点击跳转
```javascript
// 点击搜索结果中的机构项
onSearchResultTap(e) {
  const item = e.currentTarget.dataset.item;
  const id = item._id;
  // ...其他判断逻辑
  wx.navigateTo({
    url: `/pages/agency-detail/agency-detail?id=${id}`
  });
}
```

### 1.2 机构卡片点击跳转
```javascript
// 首页推荐机构卡片点击
onAgencyTap(e) {
  const id = e.currentTarget.dataset.id;
  wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
},
```

---

## 二、浏览机构页跳转

**文件**: `pages/browse-agencies/browse-agencies.js`

### 2.1 机构列表卡片点击
```javascript
// 机构列表中的卡片点击事件
onAgencyTap(e) {
  const id = e.currentTarget.dataset.id;
  wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
},
```

### 2.2 搜索结果点击（根据 Tab 类型判断跳转目标）
```javascript
// 搜索结果点击，根据当前 Tab 决定跳转到机构详情还是服务详情
onSearchResultTap(e) {
  const item = e.currentTarget.dataset.item;
  if (item) {
    const url = activeTab === 'agency'
      ? `/pages/agency-detail/agency-detail?id=${item._id}`
      : `/pages/service-detail/service-detail?id=${item._id}`;
    wx.navigateTo({ url });
  }
},
```

---

## 三、智能匹配页跳转

**文件**: `pages/smart-match/smart-match.js`

### 3.1 匹配结果查看详情
```javascript
// 智能匹配结果中点击"查看详情"按钮
onDetailTap(e) {
  const agencyId = e.currentTarget.dataset.agencyid;
  if (agencyId) {
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
  }
},
```

**说明**: `agencyid` 数据来自匹配结果中每个服务项关联的机构 ID。

---

## 四、服务详情页跳转

**文件**: `pages/service-detail/service-detail.js`

### 4.1 所属机构卡片点击
```javascript
// 服务详情页中点击所属机构信息卡片
onAgencyTap() {
  const agencyId = this.data.svc.agencyProfileId;
  if (agencyId) {
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${agencyId}` });
  }
},
```

**说明**: `agencyProfileId` 是服务记录中关联的机构档案 ID。

---

## 五、管理后台跳转

**文件**: `pages/admin/agencies.js`

### 5.1 管理员查看机构详情
```javascript
// 管理后台机构列表中点击查看详细
viewDetail(e) {
  const id = e.currentTarget.dataset.id;
  wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
},
```

---

## 六、机构详情页内分享

**文件**: `pages/agency-detail/agency-detail.js`

### 6.1 分享卡片配置
```javascript
// 用户点击分享时生成的卡片信息
onShareAppMessage() {
  const { agency } = this.data;
  return {
    title: agency ? agency.orgName : '就宠你',
    path: `/pages/agency-detail/agency-detail?id=${agency?._id}`,
  };
},
```

**说明**: 分享卡片会携带当前机构的 `_id`，接收者打开后直接进入该机构详情页。

---

## 七、机构详情页接收参数

**文件**: `pages/agency-detail/agency-detail.js`

```javascript
Page({
  data: {
    agency: null,
    svcList: [],
    loading: true,
    svcLoading: true,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLoad(options) {
    // 1. 获取导航栏高度
    const statusBarHeight = getStatusBarHeight();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = statusBarHeight + (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });

    // 2. 从 URL 参数中获取机构 ID
    const { id } = options;
    if (id) {
      this.loadAgency(id);  // 加载机构信息
    }
  },

  // 加载机构档案
  async loadAgency(id) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_profiles').doc(id).get();
      const agencies = await resolveAgencyImages([res.data]);
      const agency = agencies[0];
      this.setData({ agency, loading: false });
      this.loadServices(id);  // 同时加载该机构的服务列表
    } catch (e) {
      this.setData({ agency: null, loading: false, svcLoading: false });
      wx.showToast({ title: '机构信息加载失败', icon: 'none' });
    }
  },

  // 加载机构服务列表
  async loadServices(profileId) {
    this.setData({ svcLoading: true });
    const db = wx.cloud.database();
    try {
      const res = await db.collection('agency_services')
        .where({ agencyProfileId: profileId })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();
      // ...处理服务数据
    } catch (e) {
      this.setData({ svcList: [], svcLoading: false });
    }
  },
});
```

---

## 跳转流程图

```
首页 ──────────────────────┐
                           │
浏览机构页 ────────────────┤
                           │
智能匹配页 ────────────────┼──→ /pages/agency-detail/agency-detail?id=xxx
                           │         │
服务详情页 ────────────────┤         ├──→ 加载 agency_profiles
                           │         │
管理后台 ──────────────────┤         └──→ 加载 agency_services
                           │
分享卡片 ──────────────────┘
```

---

## 数据来源

所有跳转的 `id` 参数均来自 `agency_profiles` 集合的 `_id` 字段，由云数据库自动生成。
