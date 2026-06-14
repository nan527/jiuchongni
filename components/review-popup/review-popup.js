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
