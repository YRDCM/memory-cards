const store = require("../../utils/store.js");
const sync = require("../../utils/sync.js");

const D1 = require("../../data/deck1.js");
const D2 = require("../../data/deck2.js");
const D3 = require("../../data/deck3.js");

const seen = {};
let union = 0;
[D1, D2, D3].forEach((arr) => {
  for (let i = 0; i < arr.length; i++) {
    const id = String(arr[i][0] || "").toLowerCase();
    if (id && !seen[id]) {
      seen[id] = 1;
      union += 1;
    }
  }
});

const DECKS = [
  { key: "all", label: "全部 " + union + " 个" },
  { key: "A", label: "初中 " + D1.length + " 个" },
  { key: "B", label: "高中 " + D2.length + " 个" },
  { key: "C", label: "四级 " + D3.length + " 个" },
  { key: "M", label: "我的词表" },
];

const NEW_OPTS = [10, 15, 20, 25, 30, 40];
const TARGET_OPTS = [15, 25, 35, 45, 60];
const QUIZ_OPTS = [
  { key: "card", label: "卡片自评" },
  { key: "choice", label: "选择题" },
  { key: "cloze", label: "例句填空" },
  { key: "mixed", label: "混合" },
];

Page({
  data: {
    deckLabels: DECKS.map((d) => d.label),
    deckIndex: 0,
    newLabels: NEW_OPTS.map((n) => n + " 个"),
    newIndex: 2,
    targetLabels: TARGET_OPTS.map((n) => n + " 分钟"),
    targetIndex: 1,
    quizLabels: QUIZ_OPTS.map((q) => q.label),
    quizIndex: 0,
    spelling: false,
    syncCode: "",
    syncStatus: "",
    syncBad: false,
    locked: false,
    manualUnlock: false,
    learned: 0,
  },

  onShow() {
    this.refresh();
    if (sync.enabled()) {
      sync.pull().then(() => this.refresh());
    }
  },

  refresh() {
    const S = store.state();
    let di = 0;
    for (let i = 0; i < DECKS.length; i++) {
      if (DECKS[i].key === S.set.deck) di = i;
    }
    const ni = Math.max(0, NEW_OPTS.indexOf(S.set.dailyNew));
    const ti = Math.max(0, TARGET_OPTS.indexOf(S.set.targetMin));
    let qi = 0;
    for (let i = 0; i < QUIZ_OPTS.length; i++) {
      if (QUIZ_OPTS[i].key === S.set.quiz) qi = i;
    }
    const synced = !!S.set.syncCode && !!S.sync.at && !S.sync.err;
    this.setData({
      deckIndex: di,
      newIndex: ni,
      targetIndex: ti,
      quizIndex: qi,
      spelling: !!S.set.spelling,
      syncCode: S.set.syncCode || "",
      syncStatus: sync.statusText(),
      syncBad: !!S.sync.err,
      locked: synced && !this.data.manualUnlock,
      learned: store.learnedCount(),
    });
  },

  onDeck(e) {
    const i = Number(e.detail.value);
    const S = store.state();
    S.set.deck = DECKS[i].key;
    store.save();
    store.rebuild();
    this.setData({ deckIndex: i });
    wx.showToast({ title: "已切换到 " + DECKS[i].label, icon: "none" });
  },

  onNew(e) {
    const i = Number(e.detail.value);
    const S = store.state();
    S.set.dailyNew = NEW_OPTS[i];
    store.save();
    this.setData({ newIndex: i });
  },

  onTarget(e) {
    const i = Number(e.detail.value);
    const S = store.state();
    S.set.targetMin = TARGET_OPTS[i];
    store.save();
    this.setData({ targetIndex: i });
  },

  onSpell(e) {
    const S = store.state();
    S.set.spelling = e.detail.value;
    store.save();
    this.setData({ spelling: e.detail.value });
  },

  onQuiz(e) {
    const i = Number(e.detail.value);
    const S = store.state();
    S.set.quiz = QUIZ_OPTS[i].key;
    store.save();
    this.setData({ quizIndex: i });
  },

  onCodeInput(e) {
    this.setData({ syncCode: e.detail.value });
  },

  onGenCode() {
    this.setData({ syncCode: sync.newCode(), manualUnlock: true, locked: false });
    wx.showToast({ title: "已生成，点「启用同步」", icon: "none" });
  },

  onCopyCode() {
    const code = store.state().set.syncCode || "";
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "同步码已复制", icon: "none" }),
    });
  },

  onUnlock() {
    this.setData({ manualUnlock: true, locked: false });
    wx.showToast({ title: "已解锁，可修改后重新启用", icon: "none" });
  },

  onSyncNow() {
    const code = (this.data.syncCode || "").trim().toLowerCase();
    if (code && !/^[a-z0-9]{16,64}$/.test(code)) {
      wx.showToast({ title: "同步码要 16 位以上字母或数字", icon: "none" });
      return;
    }
    const S = store.state();
    S.set.syncCode = code;
    S.set.syncOn = !!code;
    S.sync.rev = 0;
    S.sync.at = 0;
    S.sync.err = false;
    store.save();
    this.refresh();
    if (!code) {
      wx.showToast({ title: "已关闭同步", icon: "none" });
      return;
    }
    wx.showLoading({ title: "同步中" });
    sync.pull().then((r) => {
      wx.hideLoading();
      this.setData({ manualUnlock: false });
      this.refresh();
      const S = store.state();
      if (S.sync.err) {
        wx.showModal({
          title: "同步失败",
          content: (S.sync.msg || "未知原因") + "\n\n如果是 request:fail，多半是服务器域名没配：小程序后台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名，加上 https://mystarwhisper.cn，然后重新扫码预览。",
          showCancel: false,
        });
      } else {
        wx.showToast({ title: "同步完成", icon: "none" });
      }
    });
  },

  onCopyBackup() {
    const data = JSON.stringify(store.state());
    wx.setClipboardData({
      data: data,
      success: () => wx.showToast({ title: "备份已复制到剪贴板", icon: "none" }),
    });
  },

  onRestoreBackup() {
    wx.getClipboardData({
      success: (res) => {
        let obj = null;
        try {
          obj = JSON.parse(res.data);
        } catch (e) {}
        if (!obj || !obj.prog) {
          wx.showToast({ title: "剪贴板里没有有效备份", icon: "none" });
          return;
        }
        wx.showModal({
          title: "恢复备份？",
          content: "会覆盖当前进度。",
          success: (r) => {
            if (!r.confirm) return;
            const S = store.state();
            S.prog = obj.prog || {};
            S.daily = obj.daily || {};
            S.custom = obj.custom || [];
            if (obj.meta) S.meta = obj.meta;
            store.save();
            store.rebuild();
            this.refresh();
            wx.showToast({ title: "已恢复", icon: "success" });
          },
        });
      },
    });
  },

  onReset() {
    wx.showModal({
      title: "清空所有数据？",
      content: "进度、打卡、词表全部删除，无法恢复。",
      confirmColor: "#b4472a",
      success: (r) => {
        if (!r.confirm) return;
        wx.clearStorageSync();
        store.init();
        this.refresh();
        wx.showToast({ title: "已清空", icon: "success" });
      },
    });
  },
});
