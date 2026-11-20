const store = require("../../utils/store.js");
const srs = require("../../utils/srs.js");

const PAGE = 100;

Page({
  data: {
    filter: "all",
    query: "",
    items: [],
    shown: 0,
    total: 0,
    hasMore: false,
    counts: { all: 0, new: 0, learn: 0, due: 0, ok: 0 },
  },

  onShow() {
    /* 兜底：万一 tabBar 被意外隐藏，回到本页时强制恢复 */
    if (wx.showTabBar) {
      try {
        wx.showTabBar({ animation: false });
      } catch (e) {}
    }
    this.rebuild();
  },

  rebuild(keepCount) {
    const ALL = store.all();
    if (!keepCount) {
      const c = { all: ALL.length, new: 0, learn: 0, due: 0, ok: 0, expert: 0 };
      for (let i = 0; i < ALL.length; i++) c[store.statusOf(ALL[i])] += 1;
      this.setData({ counts: c });
    }
    this._filtered = this.filtered();
    this.setData({
      total: this._filtered.length,
      shown: 0,
      items: [],
    });
    this.loadMore();
  },

  filtered() {
    const ALL = store.all();
    const q = (this.data.query || "").trim().toLowerCase();
    const f = this.data.filter;
    const out = [];
    for (let i = 0; i < ALL.length; i++) {
      const w = ALL[i];
      if (f !== "all" && store.statusOf(w) !== f) continue;
      if (q && w.w.toLowerCase().indexOf(q) < 0 && w.cn.indexOf(q) < 0) continue;
      out.push(w);
    }
    return out;
  },

  loadMore() {
    const list = this._filtered || [];
    const start = this.data.shown;
    const end = Math.min(start + PAGE, list.length);
    const add = [];
    for (let i = start; i < end; i++) {
      const w = list[i];
      const s = store.statusOf(w);
      const n = srs.timesOf(store.state().prog[w.id]);
      add.push({
        id: w.id,
        w: w.w,
        pos: w.pos,
        cn: w.cn,
        times: n > 1 ? n : 0,
        label:
          s === "new" ? "未学" :
          s === "due" ? "待复习" :
          s === "expert" ? "熟练" :
          s === "ok" ? "已掌握" : "学习中",
        cls:
          s === "new" ? "badge-new" :
          s === "due" ? "badge-due" :
          s === "expert" ? "badge-expert" :
          s === "ok" ? "badge-ok" : "badge-learn",
      });
    }
    this.setData({
      items: this.data.items.concat(add),
      shown: end,
      hasMore: end < list.length,
    });
  },

  onMore() {
    this.loadMore();
  },

  onFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.f }, () => this.rebuild());
  },

  onSearch(e) {
    this.setData({ query: e.detail.value }, () => this.rebuild(true));
  },
});
