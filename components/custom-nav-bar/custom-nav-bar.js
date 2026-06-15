Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    background: {
      type: String,
      value: 'linear-gradient(135deg, #FF9800, #FFB74D)'
    }
  },

  data: {
    statusBarHeight: 0
  },

  lifetimes: {
    attached() {
      let statusBarHeight = 20;
      if (wx.getWindowInfo) {
        statusBarHeight = wx.getWindowInfo().statusBarHeight || 20;
      } else if (wx.getSystemInfoSync) {
        try {
          statusBarHeight = wx.getSystemInfoSync().statusBarHeight || 20;
        } catch (e) {}
      }
      this.setData({ statusBarHeight });
    }
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
    }
  }
})