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
