const store = require("../../utils/store.js");
const srs = require("../../utils/srs.js");
const sync = require("../../utils/sync.js");

Page({
  data: {
    idx: 1,
    total: 1,
    pct: 0,
    word: "",
    pos: "",
    cn: "",
    ex: "",
    excn: "",
    isNew: true,
    revealed: false,
    stage: "front", // front | back | spell | spellResult
    spellOk: false,
    input: "",
    pre1: "",
    pre2: "",
    pre3: "",
    done: 0,
    correct: 0,
    finished: false,
  },

  session: null,

  onLoad(options) {
    const extra = Number(options.extra || 0);
    this.startSession(extra);
  },

  onUnload() {
    if (this.session && this.session.done > 0) {
      sync.push();
    }
  },

  startSession(extraNew) {
    const q = store.buildQueue(extraNew);
    if (!q.length) {
      wx.showModal({
        title: "没有要背的词",
        content: "今天的新词和复习都做完了。可以去设置里换一个词汇范围，或者明天再来。",
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    this.session = { q: q, idx: 0, done: 0, correct: 0, repeats: 0 };
    this.paint();
  },

  paint() {
    const s = this.session;
    if (!s) return;
    if (s.idx >= s.q.length) {
      this.finish();
      return;
    }
    const id = s.q[s.idx];
    const w = store.map()[id];
    if (!w) {
      s.idx += 1;
      this.paint();
      return;
    }

    const p = store.state().prog[id];
    const isNew = !p;
    const spell = store.state().set.spelling && p;
    const n1 = srs.nextInterval(p, 1);
    const n2 = srs.nextInterval(p, 2);
    const n3 = srs.nextInterval(p, 3);

    this.setData({
      idx: s.idx + 1,
      total: Math.max(s.done + (s.q.length - s.idx), 1),
      pct: Math.round((s.done / Math.max(s.done + (s.q.length - s.idx), 1)) * 100),
      word: w.w,
      pos: w.pos,
      cn: w.cn,
      ex: w.ex,
      excn: w.excn,
      isNew: isNew,
      revealed: false,
      stage: spell ? "spell" : "front",
      spellOk: false,
      input: "",
      pre1: srs.fmtDays(n1),
      pre2: srs.fmtDays(n2),
      pre3: srs.fmtDays(n3),
      finished: false,
    });
  },

  onFlip() {
    this.setData({ revealed: true, stage: "back" });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  onCheck() {
    const v = (this.data.input || "").trim().toLowerCase();
    if (!v) {
      wx.showToast({ title: "先写点什么", icon: "none" });
      return;
    }
    this.setData({
      spellOk: v === this.data.word.toLowerCase(),
      stage: "spellResult",
    });
  },

  onSpellNext() {
    this.answer(this.data.spellOk ? 3 : 1);
  },

  onGrade(e) {
    this.answer(Number(e.currentTarget.dataset.g));
  },

  answer(g) {
    const s = this.session;
    if (!s) return;
    const id = s.q[s.idx];
    store.gradeWord(id, g);
    s.done += 1;
    if (g === 3) s.correct += 1;

    // 忘了 -> 隔几张再来一次
    if (g === 1 && s.repeats < 80) {
      s.repeats += 1;
      s.q.splice(Math.min(s.idx + 4, s.q.length), 0, id);
    }

    s.idx += 1;
    if (s.done % 5 === 0) sync.schedule();
    this.paint();
  },

  finish() {
    const s = this.session;
    store.touchBest();
    sync.push();
    wx.showModal({
      title: "这轮结束",
      content: "共 " + s.done + " 张，其中 " + s.correct + " 张一次答对。",
      showCancel: false,
      success: () => wx.navigateBack(),
    });
    this.session = null;
  },

  onEnd() {
    const s = this.session;
    if (!s) {
      wx.navigateBack();
      return;
    }
    wx.showModal({
      title: "结束本轮？",
      content: "已经背了 " + s.done + " 张，没做完的下次还会再来。",
      success: (r) => {
        if (r.confirm) {
          sync.push();
          wx.navigateBack();
        }
      },
    });
  },
});
