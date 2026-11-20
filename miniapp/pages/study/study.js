const store = require("../../utils/store.js");
const srs = require("../../utils/srs.js");
const sync = require("../../utils/sync.js");
const tts = require("../../utils/tts.js");

/* ---------- 词性中文名 ---------- */

const POS_CN = {
  n: "名词", v: "动词", vt: "及物动词", vi: "不及物动词", adj: "形容词",
  adv: "副词", prep: "介词", conj: "连词", pron: "代词", num: "数词",
  art: "冠词", int: "感叹词", aux: "助动词", modal: "情态动词",
  abbr: "缩写", phrase: "短语", phr: "短语", pl: "复数",
};

function posCN(pos) {
  const raw = String(pos || "").trim();
  if (!raw) return "";
  const toks = raw.split(/\s*[&,，/]\s*/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i].replace(/\./g, "").trim().toLowerCase();
    const c = POS_CN[k];
    if (!c) return "";
    out.push(c);
  }
  return out.join("／");
}

/* ---------- 题型工具 ---------- */

/* 释义太长不适合做选项：去掉内嵌词性、只留前两个义项、16 字截断 */
function shortCn(cn) {
  const clean = String(cn || "")
    .replace(/\b(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|modal)\.\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = clean.split(/[；;]/).filter(function (x) {
    return x.trim();
  });
  let s = parts.slice(0, 2).join("；");
  if (s.length > 16) s = s.slice(0, 15) + "…";
  return s || clean;
}

function shuffleIn(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = b[i];
    b[i] = b[j];
    b[j] = t;
  }
  return b;
}

let OPT_POOL = null;
function optionPool() {
  if (OPT_POOL) return OPT_POOL;
  const all = store.all();
  const seen = {};
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const x = all[i];
    if (!x.cn) continue;
    const s = shortCn(x.cn);
    if (s.length < 2 || s.length > 17) continue;
    if (!/[\u4e00-\u9fa5]/.test(s)) continue;
    if (/^[\[\[]/.test(s)) continue;
    if (seen[s]) continue;
    seen[s] = 1;
    out.push({ s: s, pos: x.pos, len: s.length, id: x.id });
  }
  OPT_POOL = out;
  return out;
}

function buildOptions(w) {
  const target = shortCn(w.cn);
  const pool = optionPool().filter(function (x) {
    return x.id !== w.id && x.s !== target;
  });
  const near = pool.filter(function (x) {
    return x.pos === w.pos && Math.abs(x.len - target.length) <= 4;
  });
  const rest = pool.filter(function (x) {
    return near.indexOf(x) < 0;
  });
  const picked = shuffleIn(near).concat(shuffleIn(rest)).slice(0, 3).map(function (x) {
    return x.s;
  });
  const opts = [target].concat(picked);
  const correct = Math.floor(Math.random() * opts.length);
  const tmp = opts[0];
  opts[0] = opts[correct];
  opts[correct] = tmp;
  return { options: opts, correct: correct };
}

/* 在例句里找出目标词的实际形态（含变形） */
function findForm(sentence, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("\\b" + esc + "(s|es|ed|d|ing|ies|ied)?\\b", "i");
  const m = re.exec(sentence);
  return m ? m[0] : null;
}

function buildCloze(w) {
  const form = findForm(w.ex, w.w);
  if (!form) return null;
  return {
    sentence: w.ex.replace(form, "＿＿＿＿"),
    answer: form.toLowerCase(),
    word: w.w,
  };
}

/* ---------- 记忆联动：同族词 + 词缀拆解 ---------- */

/* 只保留不容易误拆的前缀（in- / de- / ex- 这类会和词干混淆，弃用） */
const PREFIX_CN = {
  un: "不", re: "再；重新", dis: "相反；否定", non: "非",
  pre: "预先", post: "之后", over: "过度", under: "不足；在下", mis: "错误地",
  out: "超过；向外", anti: "反对", auto: "自动", multi: "多",
  sub: "下面", super: "超越", tele: "远", self: "自我",
  semi: "半", mini: "小", mid: "中间", inter: "之间",
};

const SUFFIX_CN = {
  tion: "名词：动作或状态", sion: "名词：动作或状态", ment: "名词：结果",
  ness: "名词：性质", ity: "名词：性质", able: "形容词：能…的",
  ible: "形容词：能…的", ful: "形容词：充满…的", less: "形容词：无…的",
  ly: "副词后缀", er: "名词：人／物", ist: "名词：人", ism: "名词：主义",
  ize: "动词：使…", ous: "形容词：有…性质", ive: "形容词后缀",
  al: "形容词后缀", ic: "形容词后缀", ship: "名词：身份", hood: "名词：身份",
};

function shortGloss(cn) {
  const s = String(cn || "").split(/[；;，,]/)[0].trim();
  return s.length > 8 ? s.slice(0, 8) : s;
}

function familyOf(w) {
  const all = store.all();
  const word = w.id;
  const hits = [];
  for (let i = 0; i < all.length && hits.length < 8; i++) {
    const x = all[i];
    if (x.id === word) continue;
    if (x.id.length >= 4 && (x.id.indexOf(word) === 0 || (word.length >= 4 && x.id.slice(-word.length) === word))) {
      hits.push(x);
      continue;
    }
    if (x.id.length >= 3 && word.indexOf(x.id) === 0) hits.push(x);
  }
  return hits.slice(0, 6);
}

function splitWord(w) {
  const map = store.map();
  const word = w.id;
  const has = function (s) {
    return !!map[s];
  };
  for (const p in PREFIX_CN) {
    if (word.length - p.length < 3) continue;
    if (word.indexOf(p) !== 0) continue;
    const rest = word.slice(p.length);
    if (!has(rest)) continue;
    return [
      { t: p + "-", g: PREFIX_CN[p] },
      { t: rest, g: shortGloss((map[rest] || {}).cn) },
    ];
  }
  for (const s in SUFFIX_CN) {
    if (word.length - s.length < 3) continue;
    if (word.slice(-s.length) !== s) continue;
    const base = word.slice(0, word.length - s.length);
    let hit = has(base) ? base : has(base + "e") ? base + "e" : null;
    if (!hit && base.slice(-1) === "i" && has(base.slice(0, -1) + "y")) {
      hit = base.slice(0, -1) + "y";
    }
    if (!hit) continue;
    return [
      { t: hit, g: shortGloss((map[hit] || {}).cn) },
      { t: "-" + s, g: SUFFIX_CN[s] },
    ];
  }
  return null;
}

function memoOf(w) {
  const parts = splitWord(w);
  const used = {};
  if (parts) {
    parts.forEach(function (p) {
      used[p.t.replace(/-/g, "").toLowerCase()] = 1;
    });
  }
  const fam = familyOf(w)
    .filter(function (x) {
      return !used[x.id];
    })
    .map(function (x) {
      return { w: x.w, g: shortGloss(x.cn) };
    });
  return { parts: parts || [], fam: fam };
}

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
    stage: "front", // front | back | spell | spellResult | choice | cloze | quizResult
    spellOk: false,
    input: "",
    pre1: "",
    pre2: "",
    pre3: "",
    done: 0,
    correct: 0,
    finished: false,
    options: [],
    correctIdx: -1,
    picked: -1,
    lastOk: false,
    cloze: null,
    quizTag: "",
    hintCn: "",
    posCn: "",
    posMeta: "",
    memoParts: [],
    memoFam: [],
    ttsOk: false,
    keys: ["A", "B", "C", "D"],
  },

  session: null,

  onLoad(options) {
    OPT_POOL = null;
    this.setData({ ttsOk: tts.available() });
    this.startSession(Number(options.extra || 0));
  },

  onUnload() {
    tts.stop();
    if (this.session && this.session.done > 0) sync.push();
  },

  onSpeak() {
    const w = this.data.word;
    if (!w) return;
    tts.speak(w, {
      onFail: function (m) {
        wx.showToast({ title: "发音不可用：" + m, icon: "none" });
      },
    });
  },

  onSpeakEx() {
    const s = this.data.ex;
    if (!s) return;
    tts.speakSentence(s);
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

  /** 新词永远先看卡片；复习词才上题 */
  pickMode(w, isNew) {
    const q = store.state().set.quiz || "card";
    const spelling = !!store.state().set.spelling;
    if (isNew) return "card";
    if (q === "card") return spelling ? "spell" : "card";
    const canCloze = !!(w.ex && findForm(w.ex, w.w));
    if (q === "choice") return "choice";
    if (q === "cloze") return canCloze ? "cloze" : "choice";
    const r = Math.random();
    if (r < 0.3) return spelling ? "spell" : "card";
    if (r < 0.65) return "choice";
    return canCloze ? "cloze" : "choice";
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
    const mode = this.pickMode(w, isNew);
    const memo = memoOf(w);
    const n1 = srs.nextInterval(p, 1);
    const n2 = srs.nextInterval(p, 2);
    const n3 = srs.nextInterval(p, 3);

    const patch = {
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
      stage: mode,
      spellOk: false,
      input: "",
      picked: -1,
      lastOk: false,
      options: [],
      correctIdx: -1,
      cloze: null,
      quizTag: "",
      posCn: posCN(w.pos),
      posMeta: srs.timesOf(p) > 1 ? "已学 " + srs.timesOf(p) + " 次" : "第一次见",
      memoParts: memo.parts,
      memoFam: memo.fam,
      pre1: srs.fmtDays(n1),
      pre2: srs.fmtDays(n2),
      pre3: srs.fmtDays(n3),
      finished: false,
    };

    if (mode === "choice") {
      const o = buildOptions(w);
      patch.options = o.options;
      patch.correctIdx = o.correct;
      patch.quizTag = "选出正确释义";
    } else if (mode === "cloze") {
      patch.cloze = buildCloze(w);
      patch.quizTag = "填出空缺的单词";
      patch.hintCn = shortCn(w.cn);
    }

    this.setData(patch);
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
    this.setData({ spellOk: v === this.data.word.toLowerCase(), stage: "spellResult" });
  },

  onSpellNext() {
    this.answer(this.data.spellOk ? 3 : 1);
  },

  /* ---------- 选择题 ---------- */

  onPick(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({
      picked: i,
      lastOk: i === this.data.correctIdx,
      stage: "quizResult",
    });
  },

  /* ---------- 例句填空 ---------- */

  onClozeCheck() {
    const v = (this.data.input || "").trim().toLowerCase();
    if (!v) {
      wx.showToast({ title: "先写点什么", icon: "none" });
      return;
    }
    const c = this.data.cloze || {};
    this.setData({
      lastOk: v === c.answer || v === String(c.word || "").toLowerCase(),
      stage: "quizResult",
    });
  },

  onQuizNext() {
    this.answer(this.data.lastOk ? 3 : 1);
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
