const store = require("./utils/store.js");

App({
  globalData: {
    store: store,
    version: "1.0.0",
  },

  onLaunch() {
    store.init();
  },

  onShow() {
    // 回到前台时把未推的同步补上
    store.touchSession();
  },
});
