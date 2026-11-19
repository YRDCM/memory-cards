const srs = require("./srs.js");

const KEY = "eyc_v1";
const DAY = 86400000;

const DEFAULT_SET = {
  dailyNew: 20,
  targetMin: 25,
  reminder: "20:30",
  spelling: false,
  deck: "all",
  quiz: "card",
  syncCode: "",
  syncOn: true,
};

/* ---------- 日期 ---------- */

const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
const dayKey = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayKey = () => dayKey(new Date());

function keyToDate(k) {
  const p = k.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function shiftKey(k, n) {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/* ---------- 状态 ---------- */

function fresh() {
  return {
    prog: {},
    custom: [],
    daily: {},
    set: Object.assign({}, DEFAULT_SET),
    meta: { created: todayKey(), lastActive: "", bestStreak: 0 },
    sync: { rev: 0, at: 0, err: false },
  };
}

let S = null;
let ALL = [];
let MAP = {};
let deckCache = null;

function decks() {
  if (!deckCache) {
    deckCache = {
      A: require("../data/deck1.js"),
      B: require("../data/deck2.js"),
      C: require("../data/deck3.js"),
    };
  }
  return deckCache;
}

function buildAll() {
  const d = decks();
  const seen = {};
  const out = [];
  const push = (arr, deck) => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const w = arr[i];
      if (!w || !w[0]) continue;
      const id = String(w[0]).trim().toLowerCase();
      if (!id || seen[id]) continue;
      seen[id] = 1;
      out.push({
        id: id,
        w: String(w[0]).trim(),
        pos: w[1] || "",
        cn: w[2] || "",
        ex: w[3] || "",
        excn: w[4] || "",
        deck: deck,
      });
    }
  };
  push(d.A, "A");
  push(d.B, "B");
  push(d.C, "C");
  push(S.custom, "M");

  const f = S.set.deck;
  if (!f || f === "all") return out;
  return out.filter((w) => w.deck === f);
}

function rebuild() {
  ALL = buildAll();
  MAP = {};
  for (let i = 0; i < ALL.length; i++) MAP[ALL[i].id] = ALL[i];
}

function init() {
  let raw = null;
  try {
    raw = wx.getStorageSync(KEY);
  } catch (e) {
    raw = null;
  }
  if (raw && typeof raw === "object") {
    const base = fresh();
    S = {
      prog: raw.prog || {},
      custom: Array.isArray(raw.custom) ? raw.custom : [],
      daily: raw.daily || {},
      set: Object.assign({}, base.set, raw.set || {}),
      meta: Object.assign({}, base.meta, raw.meta || {}),
      sync: Object.assign({}, base.sync, raw.sync || {}),
    };
  } else {
    S = fresh();
  }
  if (["all", "A", "B", "C", "M"].indexOf(S.set.deck) < 0) S.set.deck = "all";
  rebuild();
  return S;
}

function save() {
  try {
    wx.setStorageSync(KEY, S);
  } catch (e) {}
}

function state() {
  if (!S) init();
  return S;
}

/* ---------- 统计口径 ---------- */

function day(k) {
  const key = k || todayKey();
  if (!S.daily[key]) S.daily[key] = { cards: 0, sec: 0, newW: 0, reviews: 0, correct: 0 };
  return S.daily[key];
}

function dueList() {
  const now = Date.now();
  return ALL.filter((w) => {
    const p = S.prog[w.id];
    return p && p.due <= now;
  });
}

function learnedCount() {
  let n = 0;
  for (let i = 0; i < ALL.length; i++) if (S.prog[ALL[i].id]) n++;
  return n;
}

function avgRetention() {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ALL.length; i++) {
    const p = S.prog[ALL[i].id];
    if (p) {
      sum += srs.retention(p);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function goalCards() {
  return Math.max(5, S.set.dailyNew);
}

function isChecked(k) {
  const d = S.daily[k];
  return !!d && d.cards >= goalCards();
}

function streak() {
  let n = 0;
  let k = todayKey();
  if (!isChecked(k)) k = shiftKey(k, -1);
  while (isChecked(k)) {
    n++;
    k = shiftKey(k, -1);
    if (n > 3650) break;
  }
  return n;
}

function touchBest() {
  const s = streak();
  if (s > (S.meta.bestStreak || 0)) {
    S.meta.bestStreak = s;
    save();
  }
}

function statusOf(w) {
  const p = S.prog[w.id];
  if (!p) return "new";
  if (p.due <= Date.now()) return "due";
  if (p.r >= 3) return "ok";
  return "learn";
}

/* ---------- 打分 ---------- */

function gradeWord(id, g) {
  const isNew = !S.prog[id];
  const p = srs.apply(S.prog[id], g);
  S.prog[id] = p;

  const d = day();
  d.cards += 1;
  if (g === 3) d.correct += 1;
  if (isNew) d.newW += 1;
  else d.reviews += 1;
  S.meta.lastActive = todayKey();
  save();
  return p;
}

/* ---------- 会话队列 ---------- */

function buildQueue(extraNew) {
  const now = Date.now();
  const d = day();
  const reviews = [];
  const freshWords = [];
  for (let i = 0; i < ALL.length; i++) {
    const w = ALL[i];
    const p = S.prog[w.id];
    if (!p) freshWords.push(w);
    else if (p.due <= now) reviews.push(w);
  }
  // 洗牌，避免每次顺序一样
  for (let i = reviews.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = reviews[i];
    reviews[i] = reviews[j];
    reviews[j] = t;
  }
  const quota = Math.max(0, S.set.dailyNew + (extraNew || 0) - d.newW);
  const news = freshWords.slice(0, quota);

  const q = [];
  let i = 0;
  let j = 0;
  while (i < news.length || j < reviews.length) {
    if (i < news.length) q.push(news[i++].id);
    if (j < reviews.length) q.push(reviews[j++].id);
    if (j < reviews.length) q.push(reviews[j++].id);
  }
  return q;
}

/* ---------- 导出 ---------- */

module.exports = {
  KEY: KEY,
  DAY: DAY,
  init: init,
  state: state,
  save: save,
  rebuild: rebuild,
  all: () => ALL,
  map: () => MAP,
  day: day,
  todayKey: todayKey,
  dayKey: dayKey,
  shiftKey: shiftKey,
  keyToDate: keyToDate,
  dueList: dueList,
  learnedCount: learnedCount,
  avgRetention: avgRetention,
  streak: streak,
  touchBest: touchBest,
  statusOf: statusOf,
  gradeWord: gradeWord,
  buildQueue: buildQueue,
  goalCards: goalCards,
  isChecked: isChecked,
  defaultSet: DEFAULT_SET,
  touchSession: function () {
    if (S) S.meta.lastActive = todayKey();
  },
};
