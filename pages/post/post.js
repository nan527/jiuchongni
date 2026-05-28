// pages/post/post.js
const authService = require('../../services/authService');

const TOPIC_LIST = [
  '日常晒宠', '养宠经验', '健康问答', '寄养分享', '领养信息', '搞笑瞬间',
];

Page({
  data: {
    title: '',
    content: '',
    fileList: [],
    imageUrls: [],
    topics: TOPIC_LIST,
    selectedTopics: [],
    publishing: false,
  },

  async onLoad() {
    const userInfo = await authService.checkLogin();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._userId = userInfo._id;
  },

  // ===== 表单事件 =====
  onTitleChange(e) {
    this.setData({ title: e.detail });
  },

  onContentChange(e) {
    this.setData({ content: e.detail });
  },

  /** 选择 / 取消话题 */
  toggleTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    let selected = [...this.data.selectedTopics];
    const idx = selected.indexOf(topic);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      if (selected.length >= 3) {
        wx.showToast({ title: '最多选择3个话题', icon: 'none' });
        return;
      }
      selected.push(topic);
    }
    this.setData({ selectedTopics: selected });
  },

  /** 选择图片 */
  afterRead(event) {
    const { file } = event.detail;
    const files = Array.isArray(file) ? file : [file];
    const startIndex = this.data.fileList.length;
    const newFileList = [...this.data.fileList, ...files.map(f => ({ url: f.url, status: 'uploading', message: '上传中' }))];
    const newImageUrls = [...this.data.imageUrls, ...files.map(() => '')];
    this.setData({ fileList: newFileList, imageUrls: newImageUrls });

    files.forEach((f, i) => {
      const fileIndex = startIndex + i;
      wx.cloud.uploadFile({
        cloudPath: `posts/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`,
        filePath: f.url,
        success: (res) => {
          const updatedList = [...this.data.fileList];
          updatedList[fileIndex] = { ...updatedList[fileIndex], status: 'done', message: '' };
          const updatedUrls = [...this.data.imageUrls];
          updatedUrls[fileIndex] = res.fileID;
          this.setData({ fileList: updatedList, imageUrls: updatedUrls });
        },
        fail: () => {
          const updatedList = [...this.data.fileList];
          updatedList[fileIndex] = { ...updatedList[fileIndex], status: 'failed', message: '失败' };
          this.setData({ fileList: updatedList });
        },
      });
    });
  },

  /** 删除图片 */
  deleteImage(event) {
    const { index } = event.detail;
    const fileList = [...this.data.fileList];
    const imageUrls = [...this.data.imageUrls];
    fileList.splice(index, 1);
    imageUrls.splice(index, 1);
    this.setData({ fileList, imageUrls });
  },

  /** 发布帖子 */
  async publish() {
    if (!this.data.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请输入正文', icon: 'none' });
      return;
    }
    if (this.data.publishing) return;
    this.setData({ publishing: true });

    try {
      const db = wx.cloud.database();
      const userInfo = await authService.checkLogin();

      await db.collection('posts').add({
        data: {
          ownerId: this._userId,
          title: this.data.title.trim(),
          content: this.data.content.trim(),
          images: this.data.imageUrls.filter(u => u),
          topics: this.data.selectedTopics,
          authorName: userInfo ? userInfo.nickname : '匿名',
          authorAvatar: userInfo ? userInfo.avatar : '',
          likeCount: 0,
          commentCount: 0,
          createTime: db.serverDate(),
        },
      });

      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      console.error('[Post] 发布失败', err);
      if (err.errCode === -502005) {
        wx.showModal({
          title: '集合不存在',
          content: '请先在云开发控制台创建 posts 集合（权限：仅创建者可读写）',
          showCancel: false,
        });
      } else {
        wx.showToast({ title: '发布失败', icon: 'none' });
      }
    } finally {
      this.setData({ publishing: false });
    }
  },
});
