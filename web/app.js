/* ============================================================
   记忆卡片盒 · 应用逻辑
   ============================================================ */
(function () {
  "use strict";

  /* ========== 基础工具 ========== */
  const DAY = 86400000;
  const KEY = "eyc_v1";

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const pad2 = (n) => String(n).padStart(2, "0");
  const dayKey = (d) =>
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  const todayKey = () => dayKey(new Date());
  const keyToDate = (k) => {
    const p = k.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };
  const shiftKey = (k, n) => {
    const d = keyToDate(k);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNarrow = () => window.innerWidth <= 720;

  /* 品牌标：与 favicon 同一份图形 */
  const MARK_SVG =
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<rect width="64" height="64" rx="14" fill="#0f6b5c"/>' +
    '<rect x="12" y="17" width="34" height="37" rx="4" fill="#68a394" transform="rotate(-14 29 35)"/>' +
    '<rect x="15" y="13" width="34" height="39" rx="4" fill="#fafbf6" transform="rotate(-5 32 32)"/>' +
    '<circle cx="47" cy="17" r="8" fill="#b4472a" stroke="#0f6b5c" stroke-width="3"/>' +
    "</svg>";
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };

  /* ========== 状态 ========== */
  const DEFAULT_SET = {
    dailyNew: 20,
    targetMin: 25,
    reminder: "20:30",
    spelling: false,
    rate: 0.9,
    deck: "all",
    syncCode: "",
    syncOn: true,
  };

  function freshState() {
    return {
      v: 1,
      prog: {},
      custom: [],
      daily: {},
      set: Object.assign({}, DEFAULT_SET),
      meta: { created: todayKey(), lastActive: "", bestStreak: 0 },
      timer: { left: 25 * 60, mode: "focus" },
      sync: { rev: 0, at: 0, err: false },
    };
  }

  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) return freshState();
    try {
      const s = JSON.parse(raw);
      const base = freshState();
      const set = Object.assign({}, base.set, s.set || {});
      if (["all", "A", "B", "C", "M"].indexOf(set.deck) < 0) set.deck = "all";
      return {
        v: 1,
        prog: s.prog || {},
        custom: Array.isArray(s.custom) ? s.custom : [],
        daily: s.daily || {},
        set: set,
        meta: Object.assign({}, base.meta, s.meta || {}),
        timer: Object.assign({}, base.timer, s.timer || {}),
        sync: Object.assign({}, base.sync, s.sync || {}),
      };
    } catch (e) {
      return freshState();
    }
  }

  let S = loadState();
  let saveTimer = null;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
      } catch (e) {
        /* 存储不可用时静默 */
      }
    }, 120);
  }

  function save() {
    persist();
    schedulePush();
  }

  let storageOK = true;
  try {
    localStorage.setItem("__eyc_probe", "1");
    localStorage.removeItem("__eyc_probe");
  } catch (e) {
    storageOK = false;
  }

  function day(k) {
    k = k || todayKey();
    if (!S.daily[k]) S.daily[k] = { cards: 0, sec: 0, newW: 0, reviews: 0, correct: 0 };
    const d = S.daily[k];
    if (typeof d.sec !== "number") d.sec = 0;
    return d;
  }

  /* ========== 词库 ========== */
  function buildAll() {
    const seen = new Set();
    const out = [];
    const pushDeck = (arr, deck) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((w) => {
        if (!Array.isArray(w) || !w[0]) return;
        const id = String(w[0]).trim().toLowerCase();
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({
          id,
          w: String(w[0]).trim(),
          pos: w[1] || "",
          cn: w[2] || "",
          ex: w[3] || "",
          excn: w[4] || "",
          deck,
        });
      });
    };
    pushDeck(typeof DECK1 !== "undefined" ? DECK1 : [], "A");
    pushDeck(typeof DECK2 !== "undefined" ? DECK2 : [], "B");
    pushDeck(typeof DECK3 !== "undefined" ? DECK3 : [], "C");
    pushDeck(S.custom, "M");

    const f = S.set.deck;
    if (!f || f === "all") return out;
    return out.filter((w) => w.deck === f);
  }

  let ALL = [];
  let MAP = new Map();
  function rebuildWords() {
    ALL = buildAll();
    MAP = new Map(ALL.map((w) => [w.id, w]));
  }
  rebuildWords();

  function totalWords() {
    const set = new Set();
    [
      typeof DECK1 !== "undefined" ? DECK1 : [],
      typeof DECK2 !== "undefined" ? DECK2 : [],
      typeof DECK3 !== "undefined" ? DECK3 : [],
      S.custom,
    ].forEach((a) =>
      a.forEach((w) => {
        if (w && w[0]) set.add(String(w[0]).trim().toLowerCase());
      })
    );
    return set.size;
  }

  const progOf = (id) => S.prog[id] || null;

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

  /* 记忆保持率：指数衰减，强度由当前间隔决定 */
  function retention(p) {
    if (!p) return 0;
    const t = (Date.now() - (p.seen || Date.now())) / DAY;
    const strength = Math.max(0.6, (p.i || 0.6) * 1.6);
    return Math.exp(-t / strength);
  }

  function avgRetention() {
    const ws = ALL.filter((w) => S.prog[w.id]);
    if (!ws.length) return 0;
    let s = 0;
    ws.forEach((w) => (s += retention(S.prog[w.id])));
    return s / ws.length;
  }

  /* ========== 间隔重复 ========== */
  function nextInterval(p, g) {
    const base = p || { e: 2.5, i: 0 };
    if (g === 1) return 10 / 1440;
    if (g === 2) return base.i < 1 ? 1 : Math.min(base.i * 1.5, 200);
    return base.i === 0 ? 1 : Math.min(base.i * clamp(base.e + 0.1, 1.3, 3.0), 200);
  }

  function fmtDays(d) {
    if (d < 1) return Math.round(d * 1440) + " 分钟后";
    if (d < 30) return Math.round(d) + " 天后";
    return Math.max(1, Math.round(d / 30)) + " 个月后";
  }

  function gradeWord(id, g) {
    const now = Date.now();
    let p = S.prog[id];
    const isNew = !p;
    if (!p) {
      p = S.prog[id] = { e: 2.5, i: 0, r: 0, due: now, lapses: 0, born: now, seen: now };
    }
    if (g === 1) {
      p.e = clamp(p.e - 0.2, 1.3, 3.0);
      p.i = 10 / 1440;
      p.r = 0;
      p.lapses += 1;
    } else if (g === 2) {
      p.e = clamp(p.e - 0.05, 1.3, 3.0);
      p.i = p.i < 1 ? 1 : Math.min(p.i * 1.5, 200);
      p.r += 1;
    } else {
      p.e = clamp(p.e + 0.1, 1.3, 3.0);
      p.i = p.i === 0 ? 1 : Math.min(p.i * p.e, 200);
      p.r += 1;
    }
    p.due = now + p.i * DAY;
    p.seen = now;

    const d = day();
    d.cards += 1;
    if (g === 3) d.correct += 1;
    if (isNew) d.newW += 1;
    else d.reviews += 1;
    S.meta.lastActive = todayKey();
    save();
    return p;
  }

  function statusOf(w) {
    const p = S.prog[w.id];
    if (!p) return "new";
    if (p.due <= Date.now()) return "due";
    if (p.r >= 3) return "ok";
    return "learn";
  }

  /* ========== 多设备同步 ========== */
  const API = "/english/api";
  let pushing = false;
  let applyingRemote = false;
  let pushTimer = null;

  const syncable = () =>
    !!S.set.syncCode && S.set.syncOn !== false && location.protocol !== "file:";

  function exportState() {
    return { v: 1, prog: S.prog, custom: S.custom, daily: S.daily, set: S.set, meta: S.meta };
  }

  function newSyncCode() {
    const CH = "abcdefghijkmnpqrstuvwxyz23456789";
    const a = new Uint8Array(24);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (let i = 0; i < 24; i++) a[i] = Math.floor(Math.random() * 256);
    let out = "";
    for (let i = 0; i < 24; i++) out += CH[a[i] % CH.length];
    return out;
  }

  /* 合并：每个词取「更晚见过的」那一份，绝不丢词 */
  function mergeRemote(remote) {
    if (!remote || !remote.prog) return S;
    const rp = remote.prog || {};
    const prog = Object.assign({}, rp);
    Object.keys(S.prog).forEach((k) => {
      const a = S.prog[k];
      const b = prog[k];
      if (!b || (a.seen || 0) >= (b.seen || 0)) prog[k] = a;
    });

    const rd = remote.daily || {};
    const keys = new Set(Object.keys(S.daily).concat(Object.keys(rd)));
    const daily = {};
    keys.forEach((k) => {
      const a = S.daily[k] || {};
      const b = rd[k] || {};
      daily[k] = {
        cards: Math.max(a.cards || 0, b.cards || 0),
        sec: Math.max(a.sec || 0, b.sec || 0),
        newW: Math.max(a.newW || 0, b.newW || 0),
        reviews: Math.max(a.reviews || 0, b.reviews || 0),
        correct: Math.max(a.correct || 0, b.correct || 0),
      };
    });

    const seen = new Set();
    const custom = [];
    (S.custom || []).concat(remote.custom || []).forEach((w) => {
      const id = String((w && w[0]) || "").toLowerCase();
      if (!id || seen.has(id)) return;
      seen.add(id);
      custom.push(w);
    });

    return {
      prog,
      daily,
      custom,
      bestStreak: Math.max(S.meta.bestStreak || 0, (remote.meta && remote.meta.bestStreak) || 0),
    };
  }

  function applyRemote(m) {
    if (!m) return;
    applyingRemote = true;
    S.prog = m.prog;
    S.daily = m.daily;
    S.custom = m.custom;
    S.meta.bestStreak = m.bestStreak;
    rebuildWords();
    applyingRemote = false;
    persist();
  }

  function schedulePush() {
    if (!syncable()) return;
    const stale = Date.now() - (S.sync.at || 0) > 120000;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, stale ? 3000 : 30000);
  }

  function putState(rev) {
    return fetch(API + "/state?code=" + encodeURIComponent(S.set.syncCode), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rev: rev, state: exportState() }),
      cache: "no-store",
    });
  }

  async function pushNow() {
    if (!syncable() || pushing) return;
    pushing = true;
    try {
      let r = await putState(S.sync.rev || 0);
      if (r.status === 409) {
        const cur = await r.json();
        if (cur && cur.state && (cur.rev || 0) > (S.sync.rev || 0)) {
          applyRemote(mergeRemote(cur.state));
          S.sync.rev = cur.rev || 0;
          render();
        }
        r = await putState(S.sync.rev || 0);
      }
      if (r.ok) {
        const j = await r.json();
        S.sync.rev = j.rev || 0;
        S.sync.at = Date.now();
        S.sync.err = false;
      } else {
        S.sync.err = true;
      }
    } catch (e) {
      S.sync.err = true;
    }
    pushing = false;
    persist();
    if (S.ui === "settings") render();
  }

  async function pullNow(quiet) {
    if (!syncable()) return;
    try {
      const r = await fetch(API + "/state?code=" + encodeURIComponent(S.set.syncCode), {
        cache: "no-store",
      });
      if (r.status === 404) {
        S.sync.rev = 0;
        await pushNow();
        return;
      }
      if (!r.ok) {
        S.sync.err = true;
        persist();
        return;
      }
      const j = await r.json();
      if (j && j.state) {
        applyRemote(mergeRemote(j.state));
        S.sync.rev = j.rev || 0;
        S.sync.at = Date.now();
        S.sync.err = false;
        render();
        await pushNow();
      }
    } catch (e) {
      S.sync.err = true;
      persist();
      if (!quiet) toast("连不上同步服务，先记在本机。", "warn");
    }
  }

  function syncStatusText() {
    if (!S.set.syncCode) {
      return location.protocol === "file:"
        ? "未启用。本地文件模式下无法同步，部署到服务器后可用。"
        : "未启用。填一个同步码，手机和电脑就能共用进度。";
    }
    if (S.sync.err) return "同步失败 —— 检查网络，或确认服务器上的同步服务在跑。";
    if (!S.sync.at) return "已填写同步码，等待第一次同步…";
    const d = new Date(S.sync.at);
    return "已同步 · " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + " · 同步码就是密码，别外传";
  }

  /* ========== 打卡 ========== */
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

  function bestStreak() {
    return Math.max(S.meta.bestStreak || 0, streak());
  }

  function touchBest() {
    const s = streak();
    if (s > (S.meta.bestStreak || 0)) {
      S.meta.bestStreak = s;
      save();
    }
  }

  /* ========== 发音 ========== */
  let voices = [];
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = clamp(Number(S.set.rate) || 0.9, 0.5, 1.5);
      const pick =
        voices.find((v) => /en[-_]US/i.test(v.lang)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (pick) u.voice = pick;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* 忽略 */
    }
  }

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 680;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      o.start();
      o.stop(ctx.currentTime + 0.56);
      setTimeout(() => {
        try {
          ctx.close();
        } catch (e) {}
      }, 800);
    } catch (e) {}
  }

  /* ========== 计时器 ========== */
  const timer = {
    total: 25 * 60,
    left: Math.max(0, Number(S.timer.left) || 25 * 60),
    running: false,
    mode: S.timer.mode === "break" ? "break" : "focus",
  };
  if (timer.left <= 0) timer.left = timer.mode === "focus" ? 25 * 60 : 5 * 60;
  timer.total = timer.mode === "focus" ? 25 * 60 : 5 * 60;

  function fmtClock(s) {
    s = Math.max(0, Math.round(s));
    return pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
  }

  function timerStart() {
    if (timer.running) return;
    if (timer.left <= 0) timer.left = timer.total;
    timer.running = true;
    render();
  }

  function timerStop() {
    timer.running = false;
    render();
  }

  function timerReset() {
    timer.running = false;
    timer.total = timer.mode === "focus" ? 25 * 60 : 5 * 60;
    timer.left = timer.total;
    S.timer = { left: timer.left, mode: timer.mode };
    save();
    render();
  }

  function timerTick() {
    if (!timer.running) return;
    timer.left -= 1;
    if (timer.mode === "focus") {
      day().sec += 1;
      if (timer.left % 5 === 0) save();
    }
    if (timer.left <= 0) {
      timer.left = 0;
      timer.running = false;
      beep();
      const fin = day().sec;
      toast(
        timer.mode === "focus"
          ? "专注完成。站起来走两分钟，今天已累计 " + Math.round(fin / 60) + " 分钟。"
          : "休息结束。回来做下一组。"
      );
      timer.mode = timer.mode === "focus" ? "break" : "focus";
      timer.total = timer.mode === "focus" ? 25 * 60 : 5 * 60;
      timer.left = timer.total;
      S.timer = { left: timer.left, mode: timer.mode };
      save();
    }
    S.timer = { left: timer.left, mode: timer.mode };
    const el = $(".timer-clock");
    if (el) {
      el.textContent = fmtClock(timer.left);
      const box = el.closest(".timer");
      if (box) box.classList.toggle("is-running", timer.running);
    }
    if (timer.left % 5 === 0) save();
  }

  /* ========== 学习会话 ========== */
  let session = null;

  function buildQueue(extraNew) {
    const now = Date.now();
    const d = day();
    const reviews = [];
    const fresh = [];
    for (let i = 0; i < ALL.length; i++) {
      const w = ALL[i];
      const p = S.prog[w.id];
      if (!p) fresh.push(w);
      else if (p.due <= now) reviews.push(w);
    }
    shuffle(reviews);
    const quota = Math.max(0, S.set.dailyNew + (extraNew || 0) - d.newW);
    const news = fresh.slice(0, quota);
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

  function startSession(extraNew) {
    const q = buildQueue(extraNew);
    if (!q.length) {
      toast("这个范围里的词都学完了。去设置里换一个大一点的词汇范围。");
      return;
    }
    session = {
      q,
      idx: 0,
      total: q.length,
      done: 0,
      correct: 0,
      revealed: false,
      stage: "front",
      spellResult: null,
      repeats: 0,
      started: Date.now(),
    };
    S.ui = "study";
    primeCard();
    if (!timer.running) timerStart();
    render();
  }

  function currentWord() {
    if (!session) return null;
    const id = session.q[session.idx];
    return MAP.get(id) || null;
  }

  /* 决定这张卡是「看词想义」还是「看义拼词」 */
  function primeCard() {
    if (!session) return;
    const w = currentWord();
    if (!w) return;
    session.revealed = false;
    session.spellResult = null;
    session.stage = S.set.spelling && progOf(w.id) ? "spell" : "front";
  }

  function nextCard() {
    if (!session) return;
    session.idx += 1;
    while (session.idx < session.q.length && !MAP.has(session.q[session.idx])) {
      session.idx += 1;
    }
    if (session.idx >= session.q.length) {
      finishSession();
      return;
    }
    primeCard();
    render();
  }

  function finishSession() {
    const s = session;
    session = null;
    touchBest();
    save();
    S.ui = "today";
    render();
    if (s) toast("这轮结束：" + s.done + " 张，其中 " + s.correct + " 张一次答对。");
  }

  function answer(g) {
    if (!session) return;
    const w = currentWord();
    if (!w) return;
    const wasNew = !S.prog[w.id];
    gradeWord(w.id, g);
    session.done += 1;
    if (g === 3) session.correct += 1;
    if (g === 1 && session.repeats < 80) {
      session.repeats += 1;
      const at = Math.min(session.idx + 4, session.q.length);
      session.q.splice(at, 0, w.id);
    }
    if (wasNew) touchBest();
    nextCard();
  }

  /* ========== 提示 ========== */
  function toast(msg, kind) {
    const wrap = $("#toasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind === "warn" ? " warn" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .4s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 420);
    }, 2600);
  }

  /* ========== 小雅 ========== */
  function coachLine() {
    const d = day();
    const due = dueList().length;
    const learned = learnedCount();
    const goal = S.set.dailyNew;
    const hour = new Date().getHours();
    const last = S.meta.lastActive;
    let gap = 0;
    if (last && last !== todayKey()) {
      gap = Math.round((keyToDate(todayKey()) - keyToDate(last)) / DAY);
    }

    if (d.cards === 0) {
      if (learned === 0) {
        return (
          "第一次见面。今天的量很小：<em>" +
          goal +
          "</em> 个新词，<em>" +
          S.set.targetMin +
          "</em> 分钟。点右边的按钮，我们开始。"
        );
      }
      if (gap >= 2) {
        return '你已经 <span class="red">' + gap + " 天</span>没来了。学过的词正在往回忘，今天先把到期的复习补上。";
      }
      if (hour >= 21) {
        return "这么晚了还一个字没背。现在开始，20 分钟也够把今天救回来。";
      }
      return (
        "今天的任务：新词 <em>" +
        goal +
        "</em> 个" +
        (due ? "，到期复习 <em>" + due + "</em> 个" : "") +
        "。先做完，再去干别的。"
      );
    }

    if (d.newW < goal) {
      return (
        "已经背了 <em>" + d.newW + "</em> 个，还差 <em>" + (goal - d.newW) + "</em> 个。别停在半路 —— 一停，前面这些就白背了。"
      );
    }
    if (due > 0) {
      return '新词够了。但还有 <span class="red">' + due + "</span> 个词到期没复习。复习比学新词值钱。";
    }
    return (
      "今天全部完成，专注 <em>" + Math.round(d.sec / 60) + "</em> 分钟。明天见 —— 隔天再看一遍，比今天多背 10 个有用。"
    );
  }

  /* ========== 视图：今日 ========== */
  function ringSVG(pct) {
    const r = 46;
    const c = 2 * Math.PI * r;
    const off = c * (1 - clamp(pct, 0, 1));
    return (
      '<div class="ring"><svg width="106" height="106" viewBox="0 0 106 106" aria-hidden="true">' +
      '<circle class="ring-track" cx="53" cy="53" r="' + r + '" fill="none" stroke-width="9"/>' +
      '<circle class="ring-fill" cx="53" cy="53" r="' + r + '" fill="none" stroke-width="9" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      "</svg>" +
      '<div class="ring-center"><div class="ring-num">' + Math.round(pct * 100) + "<small>今日完成度</small></div></div></div>"
    );
  }

  function mapSVG() {
    const narrow = isNarrow();
    const W = narrow ? 360 : 880;
    const H = narrow ? 214 : 246;
    const padL = narrow ? 34 : 44;
    const padR = narrow ? 8 : 16;
    const padT = narrow ? 8 : 16;
    const padB = narrow ? 24 : 30;
    const fs = narrow ? 9 : 10;
    const iw = W - padL - padR;
    const ih = H - padT - padB;
    const learned = ALL.filter((w) => S.prog[w.id]);

    if (!learned.length) {
      const ew = narrow ? 360 : 880;
      const eh = narrow ? 156 : 132;
      const cx = ew / 2;
      const mid = narrow ? 68 : 58;
      return (
        '<svg class="map-svg" viewBox="0 0 ' + ew + " " + eh + '" role="img" aria-label="记忆衰减图（暂无数据）">' +
        '<rect x="1" y="1" width="' + (ew - 2) + '" height="' + (eh - 2) +
        '" rx="10" fill="none" stroke="#d6dbd0" stroke-width="1.5" stroke-dasharray="6 6"/>' +
        '<text x="' + cx + '" y="' + mid + '" text-anchor="middle" font-size="' + (narrow ? 16 : 15) +
        '" fill="#6b7c7c" font-family="Segoe UI,Microsoft YaHei,sans-serif">还没有学过的词</text>' +
        '<text x="' + cx + '" y="' + (mid + 30) + '" text-anchor="middle" font-size="' + (narrow ? 12 : 12.5) +
        '" fill="#a8b3ae" font-family="Segoe UI,Microsoft YaHei,sans-serif">' +
        (narrow ? "背完第一批就会长出来" : "背完第一批，这里会长出你自己的记忆曲线") +
        "</text></svg>"
      );
    }

    const xOf = (t) => padL + iw * clamp(Math.log1p(t) / Math.log1p(60), 0, 1);
    const yOf = (r) => padT + ih * (1 - clamp(r, 0, 1));

    let g = "";
    [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
      const y = yOf(r);
      g +=
        '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y +
        '" stroke="#d6dbd0" stroke-width="1" stroke-dasharray="' +
        (r === 0 ? "0" : "2 4") + '"/>';
      g +=
        '<text x="' + (padL - 6) + '" y="' + (y + 3) +
        '" text-anchor="end" font-size="' + fs + '" font-family="Consolas,monospace" fill="#8c9b98">' +
        Math.round(r * 100) + "%</text>";
    });

    const xTicks = narrow ? [1, 7, 30] : [1, 3, 7, 14, 30, 60];
    xTicks.forEach((t) => {
      const x = xOf(t);
      const label = t === 1 ? "1天" : t === 7 ? "1周" : t === 14 ? "2周" : t === 30 ? "1月" : t === 60 ? "2月" : t + "天";
      g +=
        '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB) +
        '" stroke="#e4e8dc" stroke-width="1"/>';
      g +=
        '<text x="' + x + '" y="' + (H - padB + 12) +
        '" text-anchor="middle" font-size="' + fs + '" font-family="Consolas,monospace" fill="#8c9b98">' +
        label + "</text>";
    });

    let tau = 0;
    learned.forEach((w) => (tau += Math.max(0.6, (S.prog[w.id].i || 0.6) * 1.6)));
    tau = learned.length ? tau / learned.length : 3;
    let dstr = "";
    for (let t = 0; t <= 60; t += 1) {
      const x = xOf(t);
      const y = yOf(Math.exp(-t / tau));
      dstr += (t === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    g +=
      '<path d="' + dstr + '" fill="none" stroke="#16262b" stroke-opacity="0.22" stroke-width="1.4" stroke-dasharray="5 5"/>';

    const dots = learned.slice(0, 260);
    dots.forEach((w) => {
      const p = S.prog[w.id];
      const t = (Date.now() - (p.seen || Date.now())) / DAY;
      const r = retention(p);
      const x = xOf(Math.max(0.02, t));
      const y = yOf(r);
      const color = r >= 0.66 ? "#0f6b5c" : r >= 0.33 ? "#c9902a" : "#b4472a";
      const days = t < 1 ? Math.max(1, Math.round(t * 24)) + " 小时" : Math.round(t) + " 天";
      g +=
        '<circle class="dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' +
        (narrow ? 2.9 : 3.4) + '" fill="' +
        color + '" fill-opacity="0.78"><title>' + esc(w.w) + " · " + esc(w.cn) + " · 距上次 " + days + "</title></circle>";
    });

    return (
      '<svg class="map-svg" viewBox="0 0 ' + W + " " + H +
      '" role="img" aria-label="记忆衰减图">' + g + "</svg>"
    );
  }

  function bars7() {
    let html = "";
    let total = 0;
    for (let i = 6; i >= 0; i--) {
      const k = shiftKey(todayKey(), -i);
      const mins = Math.round(((S.daily[k] && S.daily[k].sec) || 0) / 60);
      total += mins;
      const h = Math.min(100, (mins / Math.max(1, S.set.targetMin)) * 100);
      const lbl = keyToDate(k).getDate() + "";
      html +=
        '<div class="bar' + (i === 0 ? " today" : "") + '" title="' + k + " · " + mins + ' 分钟">' +
        '<i style="height:' + Math.max(3, h) + '%"></i><b>' + lbl + "</b></div>";
    }
    if (total === 0) {
      return '<div class="bars-empty">这周还没有专注记录。<br>点右上角 ▶ 开始计时，它自己会记。</div>';
    }
    return '<div class="bars">' + html + "</div>";
  }

  function heatGrid(cols) {
    cols = cols || 18;
    const goal = goalCards();
    const offset = new Date().getDay();
    const total = (cols - 1) * 7 + offset + 1;
    const start = -(total - 1);
    let html = "";
    for (let i = 0; i < total; i++) {
      const k = shiftKey(todayKey(), start + i);
      const d = S.daily[k];
      const n = d ? d.cards : 0;
      let lvl = 0;
      if (n > 0) {
        const ratio = n / goal;
        lvl = ratio < 0.5 ? 1 : ratio < 1 ? 2 : ratio < 1.5 ? 3 : 4;
      }
      html +=
        '<div class="heat-cell' + (lvl ? " l" + lvl : "") + (i === total - 1 ? " today" : "") +
        '" title="' + k + " · " + n + ' 张"></div>';
    }
    const pad = (7 - (total % 7)) % 7;
    for (let i = 0; i < pad; i++) html += '<div class="heat-cell blank"></div>';
    return '<div class="heat"><div class="heat-grid">' + html + "</div></div>";
  }

  function viewToday() {
    const d = day();
    const due = dueList().length;
    const learned = learnedCount();
    const goal = S.set.dailyNew;
    const pct =
      clamp(Math.min(d.newW, goal) / Math.max(1, goal), 0, 1) * 0.7 +
      clamp(d.sec / 60 / Math.max(1, S.set.targetMin), 0, 1) * 0.3;
    const st = streak();
    const remainNew = Math.max(0, goal - d.newW);
    const totalLeft = remainNew + due;

    const coach =
      '<div class="coach rise">' +
      '<div class="coach-avatar">雅</div>' +
      '<div class="coach-body"><div class="coach-name">小雅 · 学习监督</div>' +
      '<div class="coach-msg">' + coachLine() + "</div></div>" +
      '<button class="btn btn-primary btn-lg" data-act="' + (totalLeft > 0 ? "start" : "extra") + '">' +
      (totalLeft > 0 ? (isNarrow() ? "开始学习" : "开始学习 · 剩余 " + totalLeft + " 张") : "再练 10 个") +
      "</button></div>";

    const map =
      '<section class="panel map-panel rise">' +
      '<div class="map-head">' +
      '<div><h2 class="map-title">遗忘地图</h2>' +
      '<p class="map-sub">每个点是一个学过的词。越往右下，越接近忘掉；复习之后它会跳回左上。</p></div>' +
      '<div class="map-stats">' +
      '<div class="map-stat' + (due ? " danger" : "") + '"><b>' + due + "</b><span>待复习</span></div>" +
      '<div class="map-stat"><b>' + learned + "</b><span>已学</span></div>" +
      '<div class="map-stat"><b>' + Math.round(avgRetention() * 100) + "%</b><span>平均保持率</span></div>" +
      "</div></div>" +
      '<div class="map-wrap">' + mapSVG() + "</div>" +
      '<div class="map-foot">' +
      (learned
        ? '<span class="legend"><i style="background:#0f6b5c"></i>稳固</span>' +
          '<span class="legend"><i style="background:#c9902a"></i>将忘</span>' +
          '<span class="legend"><i style="background:#b4472a"></i>危险</span>' +
          '<span class="legend" style="margin-left:8px"><i style="background:transparent;border-top:2px dashed #16262b;border-radius:0;width:16px;height:0"></i>你的平均遗忘线</span>'
        : '<span>背过的词会变成点子落在这张图上。复习一次，它往上跳一次。</span>') +
      '<span class="spacer"></span>' +
      '<span>' + esc(S.set.reminder) + " 之后如果还没开始，我会催你。</span>" +
      "</div></section>";

    const main =
      '<section class="panel today-main rise">' +
      '<div class="panel-head" style="padding:0"><h3 class="panel-title">今日任务</h3>' +
      '<span class="panel-hint">' + todayKey() + "</span></div>" +
      '<div class="ring-row">' + ringSVG(pct) +
      '<div class="task-list">' +
      taskRow(d.newW >= goal, "新词", Math.min(d.newW, goal) + " / " + goal) +
      taskRow(due === 0, "到期复习", due === 0 ? "已清空" : "剩 " + due + " 个") +
      taskRow(Math.round(d.sec / 60) >= S.set.targetMin, "专注", Math.round(d.sec / 60) + " / " + S.set.targetMin + " 分") +
      taskRow(st > 0, "连续打卡", st + " 天") +
      "</div></div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-act="' + (totalLeft > 0 ? "start" : "extra") + '">' +
      (totalLeft > 0 ? "继续" : "额外 10 个") + "</button>" +
      '<button class="btn" data-act="spell-toggle">拼写测试：' + (S.set.spelling ? "开" : "关") + "</button>" +
      "</div></section>";

    const bars =
      '<section class="panel panel-bars rise" style="padding:18px 20px 14px">' +
      '<div class="panel-head" style="padding:0 0 12px"><h3 class="panel-title">近 7 天专注</h3>' +
      '<span class="panel-hint">目标 ' + S.set.targetMin + " 分</span></div>" +
      bars7() + "</section>";

    const heat =
      '<section class="panel rise" style="padding:18px 20px 16px">' +
      '<div class="panel-head" style="padding:0 0 12px"><h3 class="panel-title">打卡记录</h3>' +
      '<span class="panel-hint">' + bestStreak() + " 天最长</span></div>" +
      heatGrid(isNarrow() ? 12 : 22) + "</section>";

    return coach + map + '<div class="today-grid">' + main + bars + heat + "</div>";
  }

  function taskRow(done, label, val) {
    return (
      '<div class="task-row' + (done ? " done" : "") + '">' +
      '<span class="dotm"></span><span>' + label + "</span>" +
      '<span class="val">' + val + "</span></div>"
    );
  }

  /* ========== 视图：学习 ========== */
  function viewStudy() {
    if (!session) {
      return (
        '<div class="study"><div class="panel empty">没有进行中的学习。' +
        '<div style="margin-top:14px"><button class="btn btn-primary" data-act="start">开始</button></div></div></div>'
      );
    }
    const w = currentWord();
    if (!w) return '<div class="study"><div class="panel empty">加载中…</div></div>';

    const p = progOf(w.id);
    const isNew = !p;
    const total = Math.max(session.done + session.q.length - session.idx, 1);
    const pct = clamp(session.done / total, 0, 1) * 100;

    let body = "";

    if (session.stage === "spell") {
      body =
        '<div class="fc-main">' +
        '<div><button class="speak" data-act="speak" data-text="' + esc(w.w) + '">🔊 听发音</button></div>' +
        '<div class="fc-meaning" style="margin-top:26px">' + esc(w.cn) + "</div>" +
        '<div class="fc-pos">' + esc(w.pos) + " · 根据释义拼出这个单词</div>" +
        '<div class="spell-box"><input class="spell-input" id="spell" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在这里拼写"></div>' +
        "</div>" +
        '<div class="fc-actions">' +
        '<button class="btn btn-primary btn-lg" data-act="check">检查（Enter）</button>' +
        '<span class="hint">想不出来就按 Esc</span></div>';
    } else if (session.stage === "spellResult") {
      const ok = session.spellResult === true;
      body =
        '<div class="fc-main">' +
        '<div class="fc-word" style="color:' + (ok ? "#2e7d5b" : "#b4472a") + '">' + esc(w.w) + "</div>" +
        '<div class="fc-pos">' + esc(w.pos) + " · " + (ok ? "✓ 拼对了" : "✗ 正确写法是这样") + "</div>" +
        '<div class="fc-meaning">' + esc(w.cn) + "</div>" +
        (w.ex ? '<div class="fc-ex">' + esc(w.ex) + "</div>" + '<div class="fc-excn">' + esc(w.excn) + "</div>" : "") +
        "</div>" +
        '<div class="fc-actions"><button class="btn btn-primary btn-lg" data-act="next">继续（Enter）</button></div>';
    } else if (!session.revealed) {
      body =
        '<div class="fc-main">' +
        '<div class="fc-word">' + esc(w.w) + "</div>" +
        '<div class="fc-pos">' + esc(w.pos) + "</div>" +
        '<div class="fc-meaning pending">先在心里回想它的意思，再翻开</div>' +
        "</div>" +
        '<div class="fc-actions">' +
        '<button class="speak" data-act="speak" data-text="' + esc(w.w) + '">🔊 听发音</button>' +
        '<button class="btn btn-primary btn-lg" data-act="flip">显示释义</button>' +
        '<span class="hint">空格翻开 · 1/2/3 评分</span></div>';
    } else {
      const n1 = nextInterval(p, 1);
      const n2 = nextInterval(p, 2);
      const n3 = nextInterval(p, 3);
      body =
        '<div class="fc-main">' +
        '<div class="fc-word">' + esc(w.w) + "</div>" +
        '<div class="fc-pos">' + esc(w.pos) + "</div>" +
        '<div class="fc-meaning">' + esc(w.cn) + "</div>" +
        (w.ex ? '<div class="fc-ex">' + esc(w.ex) + "</div>" + '<div class="fc-excn">' + esc(w.excn) + "</div>" : "") +
        "</div>" +
        '<div class="grade-row">' +
        '<button class="grade again" data-act="grade" data-g="1"><b>忘了</b><span>' + fmtDays(n1) + "</span></button>" +
        '<button class="grade hard" data-act="grade" data-g="2"><b>模糊</b><span>' + fmtDays(n2) + "</span></button>" +
        '<button class="grade good" data-act="grade" data-g="3"><b>会了</b><span>' + fmtDays(n3) + "</span></button>" +
        "</div>";
    }

    return (
      '<div class="study">' +
      '<div class="study-top"><span>' + (session.done + 1) + " / " + total + "</span>" +
      '<div class="study-progress"><i style="width:' + pct + '%"></i></div>' +
      '<button class="close" data-act="end">结束本轮</button></div>' +
      '<div class="flashcard" id="card">' +
      '<div class="fc-tab">' + (isNew ? "NEW" : "REVIEW") + "</div>" +
      body +
      "</div></div>"
    );
  }

  /* ========== 视图：词库 ========== */
  let wordFilter = "all";
  let wordQuery = "";

  function viewWords() {
    const counts = { all: ALL.length, new: 0, learn: 0, due: 0, ok: 0 };
    ALL.forEach((w) => {
      counts[statusOf(w)] = (counts[statusOf(w)] || 0) + 1;
    });
    const filters = [
      ["all", "全部 " + counts.all],
      ["new", "未学 " + counts.new],
      ["learn", "学习中 " + counts.learn],
      ["due", "待复习 " + counts.due],
      ["ok", "已掌握 " + counts.ok],
    ];
    const chips = filters
      .map(
        (f) =>
          '<button class="chip' + (wordFilter === f[0] ? " is-on" : "") +
          '" data-act="filter" data-f="' + f[0] + '">' + f[1] + "</button>"
      )
      .join("");

    return (
      '<div class="toolbar"><div class="chips">' + chips + "</div>" +
      '<input class="search" id="word-search" type="search" placeholder="搜索单词或释义" value="' +
      esc(wordQuery) + '"></div>' +
      '<div id="word-list">' + wordListHTML() + "</div>"
    );
  }

  function wordListHTML() {
    const q = wordQuery.trim().toLowerCase();
    let list = ALL.filter((w) => {
      if (wordFilter !== "all" && statusOf(w) !== wordFilter) return false;
      if (!q) return true;
      return w.w.toLowerCase().indexOf(q) >= 0 || w.cn.indexOf(q) >= 0;
    });
    if (!list.length) return '<div class="panel empty">没有符合条件的词。</div>';
    const shown = list.slice(0, 300);
    const badgeOf = (w) => {
      const s = statusOf(w);
      const map = { new: ["new", "未学"], learn: ["learn", "学习中"], due: ["due", "待复习"], ok: ["ok", "已掌握"] };
      const b = map[s] || map.new;
      return '<span class="badge ' + b[0] + '">' + b[1] + "</span>";
    };
    const html = shown
      .map(
        (w) =>
          '<div class="word-item"><span class="w-en">' + esc(w.w) + '</span>' +
          '<span class="w-cn">' + esc(w.pos) + " " + esc(w.cn) + "</span>" +
          badgeOf(w) + "</div>"
      )
      .join("");
    const more =
      list.length > shown.length
        ? '<div class="empty">共 ' + list.length + " 个，显示前 " + shown.length + " 个。用搜索缩小范围。</div>"
        : "";
    return '<div class="word-list">' + html + "</div>" + more;
  }

  /* ========== 视图：统计 ========== */
  /* 十二宫数据面板：借用星语站的星盘语言 */
  function starPanel() {
    const W = 1120;
    const H = 600;
    const cx = W / 2;
    const cy = H / 2 + 4;
    const R = 226;
    const NR = 52;

    const d = day();
    let sumCards = 0;
    let sumNew = 0;
    let sumSec = 0;
    let sumCorrect = 0;
    Object.keys(S.daily).forEach((k) => {
      const x = S.daily[k];
      sumCards += x.cards || 0;
      sumNew += x.newW || 0;
      sumSec += x.sec || 0;
      sumCorrect += x.correct || 0;
    });
    const learned = learnedCount();
    const due = dueList().length;
    const goal = S.set.dailyNew;
    const pctNew = Math.min(d.newW, goal) / Math.max(1, goal);
    const pctMin = Math.min(d.sec / 60, S.set.targetMin) / Math.max(1, S.set.targetMin);
    const todayPct = Math.round((pctNew * 0.7 + pctMin * 0.3) * 100);
    const keep = Math.round(avgRetention() * 100);

    const nodes = [
      { v: d.newW + "/" + goal, l: "今日新词", tone: d.newW >= goal ? "gold" : "" },
      { v: Math.round(d.sec / 60), l: "今日分钟", tone: d.sec / 60 >= S.set.targetMin ? "gold" : "" },
      { v: streak(), l: "连续打卡", tone: streak() > 0 ? "gold" : "" },
      { v: bestStreak(), l: "最长连续", tone: "" },
      { v: learned, l: "已学词数", tone: "jade" },
      { v: due, l: "待复习", tone: due > 0 ? "red" : "jade" },
      { v: keep + "%", l: "平均保持率", tone: keep >= 66 ? "jade" : keep >= 33 ? "gold" : "red" },
      { v: sumCards, l: "累计卡片", tone: "" },
      { v: sumNew, l: "累计新词", tone: "" },
      { v: Math.round(sumSec / 60), l: "累计分钟", tone: "" },
      { v: sumCards ? Math.round((sumCorrect / sumCards) * 100) + "%" : "—", l: "一次答对率", tone: "jade" },
      {
        v: Math.round((learned / Math.max(1, ALL.length)) * 100) + "%",
        l: "词库覆盖",
        tone: "",
      },
    ];

    const toneColor = { gold: "#E8C47C", jade: "#7FBF9E", red: "#C25E5E", "": "rgba(232,196,124,.28)" };

    let s = "";
    nodes.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 6;
      const x = cx + R * Math.cos(a);
      const y = cy + R * Math.sin(a);
      const accent = toneColor[n.tone] || toneColor[""];
      s +=
        '<g class="starnode">' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + NR +
        '" fill="rgba(27,23,64,0.82)" stroke="' + accent + '" stroke-width="' + (n.tone ? 1.6 : 1) + '"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (y - 2).toFixed(1) +
        '" text-anchor="middle" font-size="19" font-family="Consolas,monospace" fill="' +
        (n.tone ? accent : "#E8E6F0") + '">' + esc(n.v) + "</text>" +
        '<text x="' + x.toFixed(1) + '" y="' + (y + 18).toFixed(1) +
        '" text-anchor="middle" font-size="10.5" fill="#8B87B0" letter-spacing="1">' + esc(n.l) + "</text>" +
        "</g>";
    });

    /* 环上刻度：画在节点内侧，作为「十二宫」的细分 */
    let ticks = "";
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36;
      const r1 = R - 74;
      const r2 = R - (i % 6 === 0 ? 62 : 68);
      ticks +=
        '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + r1 * Math.sin(a)).toFixed(1) +
        '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r2 * Math.sin(a)).toFixed(1) +
        '" stroke="rgba(232,196,124,' + (i % 6 === 0 ? 0.3 : 0.12) + ')" stroke-width="1"/>';
    }

    return (
      '<div class="star-panel">' +
      '<svg class="star-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="数据面板">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="rgba(232,196,124,.18)" stroke-width="1"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R - 74) + '" fill="none" stroke="rgba(232,196,124,.1)" stroke-width="1"/>' +
      ticks +
      s +
      '<text x="' + cx + '" y="' + (cy - 26) + '" text-anchor="middle" font-size="11.5" fill="#8B87B0" letter-spacing="4">今日完成度</text>' +
      '<text x="' + cx + '" y="' + (cy + 52) + '" text-anchor="middle" font-size="86" font-family="Georgia,serif" fill="#E8C47C">' +
      todayPct + '<tspan font-size="30" fill="rgba(232,196,124,.6)">%</tspan></text>' +
      '<text x="' + cx + '" y="' + (cy + 84) + '" text-anchor="middle" font-size="11" font-family="Consolas,monospace" fill="#8B87B0" letter-spacing="2">' +
      todayKey() + "</text>" +
      "</svg></div>"
    );
  }

  function viewStats() {
    const days = Object.keys(S.daily).filter((k) => S.daily[k].cards > 0);
    let cards = 0;
    let correct = 0;
    let sec = 0;
    let newW = 0;
    Object.keys(S.daily).forEach((k) => {
      const d = S.daily[k];
      cards += d.cards || 0;
      correct += d.correct || 0;
      sec += d.sec || 0;
      newW += d.newW || 0;
    });
    const acc = cards ? Math.round((correct / cards) * 100) : 0;

    let rows = "";
    for (let i = 13; i >= 0; i--) {
      const k = shiftKey(todayKey(), -i);
      const d = S.daily[k] || { cards: 0, sec: 0, newW: 0, reviews: 0, correct: 0 };
      rows +=
        "<tr><td>" + k + '</td><td class="num">' + d.cards + '</td><td class="num">' + d.newW +
        '</td><td class="num">' + d.reviews + '</td><td class="num">' + Math.round((d.sec || 0) / 60) +
        '</td><td class="num">' + (d.cards ? Math.round((d.correct / d.cards) * 100) + "%" : "—") + "</td></tr>";
    }

    const cardsHTML =
      '<div class="stat-grid">' +
      statCard(Math.round(sec / 60), "分钟", "累计专注") +
      statCard(cards, "张", "累计卡片") +
      statCard(newW, "个", "累计新词") +
      statCard(acc, "%", "一次答对率") +
      "</div>";

    return (
      starPanel() +
      cardsHTML +
      '<div class="today-grid stats-grid" style="margin-bottom:20px">' +
      '<section class="panel" style="padding:18px 20px"><div class="panel-head" style="padding:0 0 14px">' +
      '<h3 class="panel-title">打卡记录</h3><span class="panel-hint">' +
      days.length + " 天有记录 · 最长 " + bestStreak() + " 天</span></div>" +
      heatGrid(isNarrow() ? 16 : 26) + "</section>" +
      '<section class="panel panel-bars" style="padding:18px 20px"><div class="panel-head" style="padding:0 0 14px">' +
      '<h3 class="panel-title">近 7 天专注</h3></div>' + bars7() + "</section></div>" +
      '<section class="panel" style="padding:18px 20px"><div class="panel-head" style="padding:0 0 14px">' +
      '<h3 class="panel-title">最近 14 天</h3><span class="panel-hint">数据都在本机</span></div>' +
      '<table class="table"><thead><tr><th>日期</th><th>卡片</th><th>新词</th><th>复习</th><th>分钟</th><th>正确率</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></section>"
    );
  }

  function statCard(num, unit, label) {
    return (
      '<div class="stat-card"><div class="stat-num">' + num + "<small>" + unit + "</small></div>" +
      '<div class="stat-label">' + label + "</div></div>"
    );
  }

  /* ========== 视图：设置 ========== */
  function viewSettings() {
    const opt = (v, cur, unit) =>
      '<option value="' + v + '"' + (Number(cur) === v ? " selected" : "") + ">" + v + unit + "</option>";

    return (
      '<div class="panel settings">' +
      '<div class="set-row"><div><div class="set-label">每日新词</div>' +
      '<div class="set-desc">20 个左右最适合每天一小时。贪多会复习不完。</div></div>' +
      '<div class="set-control"><select class="field" data-set="dailyNew" data-num="1">' +
      opt(10, S.set.dailyNew, " 个") + opt(15, S.set.dailyNew, " 个") + opt(20, S.set.dailyNew, " 个") +
      opt(25, S.set.dailyNew, " 个") + opt(30, S.set.dailyNew, " 个") + opt(40, S.set.dailyNew, " 个") +
      "</select></div></div>" +

      '<div class="set-row"><div><div class="set-label">每日专注目标</div>' +
      '<div class="set-desc">低于这个时间，当天不算完整打卡。</div></div>' +
      '<div class="set-control"><select class="field" data-set="targetMin" data-num="1">' +
      opt(15, S.set.targetMin, " 分钟") + opt(25, S.set.targetMin, " 分钟") + opt(35, S.set.targetMin, " 分钟") +
      opt(45, S.set.targetMin, " 分钟") + opt(60, S.set.targetMin, " 分钟") +
      "</select></div></div>" +

      '<div class="set-row"><div><div class="set-label">监督提醒时间</div>' +
      '<div class="set-desc">过了这个点还没开始，小雅会在首页点你的名。</div></div>' +
      '<div class="set-control"><input class="field" type="time" data-set="reminder" value="' + esc(S.set.reminder) + '"></div></div>' +

      '<div class="set-row"><div><div class="set-label">拼写测试</div>' +
      '<div class="set-desc">复习旧词时，先看中文拼出英文。更累，但记得牢得多。</div></div>' +
      '<div class="set-control"><button class="switch" role="switch" aria-checked="' +
      (S.set.spelling ? "true" : "false") + '" data-act="toggle-spell" aria-label="拼写测试"></button></div></div>' +

      '<div class="set-row"><div><div class="set-label">词汇范围</div>' +
      '<div class="set-desc">「全部」按 初中 → 高中 → 四级 的顺序排，先学完初中再进高中。换范围不会丢进度。</div></div>' +
      '<div class="set-control"><select class="field" data-set="deck">' +
      '<option value="all"' + (S.set.deck === "all" ? " selected" : "") + ">全部 " + totalWords() + " 个</option>" +
      '<option value="A"' + (S.set.deck === "A" ? " selected" : "") + ">初中 " + (typeof DECK1 !== "undefined" ? DECK1.length : 0) + " 个</option>" +
      '<option value="B"' + (S.set.deck === "B" ? " selected" : "") + ">高中 " + (typeof DECK2 !== "undefined" ? DECK2.length : 0) + " 个</option>" +
      '<option value="C"' + (S.set.deck === "C" ? " selected" : "") + ">四级 " + (typeof DECK3 !== "undefined" ? DECK3.length : 0) + " 个</option>" +
      (S.custom.length ? '<option value="M"' + (S.set.deck === "M" ? " selected" : "") + ">我的词表 " + S.custom.length + " 个</option>" : "") +
      "</select></div></div>" +

      '<div class="set-row"><div><div class="set-label">发音速度</div>' +
      '<div class="set-desc">慢一点，跟着读出来。会读才拼得对。</div></div>' +
      '<div class="set-control"><select class="field" data-set="rate" data-num="1">' +
      '<option value="0.7"' + (Number(S.set.rate) === 0.7 ? " selected" : "") + ">慢</option>" +
      '<option value="0.9"' + (Number(S.set.rate) === 0.9 ? " selected" : "") + ">正常</option>" +
      '<option value="1.1"' + (Number(S.set.rate) === 1.1 ? " selected" : "") + ">快</option>" +
      "</select></div></div>" +

      '<div class="set-row set-row-stack"><div>' +
      '<div class="set-label">多设备同步</div>' +
      '<div class="set-desc">手机和电脑填同一个同步码，进度就会自动合并。同步码相当于密码，别发到公开的地方。</div>' +
      '<div class="sync-line">' +
      '<input class="field sync-input" id="sync-code" value="' + esc(S.set.syncCode || "") +
      '" placeholder="点「生成」，或粘贴另一台设备的同步码" spellcheck="false" autocomplete="off">' +
      '<button class="btn" data-act="sync-gen">生成</button>' +
      '<button class="btn btn-primary" data-act="sync-save">' + (S.set.syncCode ? "立即同步" : "启用") + "</button>" +
      "</div>" +
      '<div class="sync-status' + (S.sync.err ? " bad" : "") + '">' + esc(syncStatusText()) + "</div>" +
      "</div></div>" +

      '<div class="set-row"><div><div class="set-label">备份与恢复</div>' +
      '<div class="set-desc">所有进度只存在这台电脑的浏览器里。换电脑或清理浏览器前，先导出。</div></div>' +
      '<div class="set-control" style="display:flex;gap:8px">' +
      '<button class="btn" data-act="export">导出</button>' +
      '<button class="btn" data-act="import">导入</button></div></div>' +

      '<div class="set-row"><div><div class="set-label">导入词表</div>' +
      '<div class="set-desc">每行一个词，格式：word 中文释义。也支持 CSV：word,词性,释义,例句,例句翻译</div></div>' +
      '<div class="set-control"><button class="btn" data-act="import-words">打开</button></div></div>' +

      '<div class="set-row"><div><div class="set-label">清空所有数据</div>' +
      '<div class="set-desc">进度、打卡、词表全部删除，无法恢复。</div></div>' +
      '<div class="set-control"><button class="btn btn-danger" data-act="reset">清空</button></div></div>' +
      "</div>"
    );
  }

  /* ========== 渲染 ========== */
  const TABS = [
    ["today", "今日"],
    ["words", "词库"],
    ["stats", "统计"],
    ["settings", "设置"],
  ];

  function render() {
    const v = S.ui || "today";
    const tabs = TABS.map(
      (t) =>
        '<button class="tab' + (v === t[0] || (v === "study" && t[0] === "today") ? " is-active" : "") +
        '" data-act="go" data-view="' + t[0] + '">' + t[1] + "</button>"
    ).join("");

    let body = "";
    if (v === "study") body = viewStudy();
    else if (v === "words") body = viewWords();
    else if (v === "stats") body = viewStats();
    else if (v === "settings") body = viewSettings();
    else body = viewToday();

    const d = day();
    const doneToday = Math.min(d.newW, S.set.dailyNew);

    $("#app").innerHTML =
      '<header class="topbar"><div class="topbar-inner">' +
      '<div class="brand"><span class="brand-mark">' + MARK_SVG + "</span>" +
      '<span><span class="brand-name">记忆卡片盒</span><br><span class="brand-sub">Spaced Repetition</span></span></div>' +
      '<nav class="nav">' + tabs + "</nav>" +
      '<div class="topbar-right">' +
      '<span class="streak-pill"><b>' + streak() + '</b> 天连续</span>' +
      '<div class="timer' + (timer.running ? " is-running" : "") + '">' +
      '<span class="timer-clock" data-act="timer-reset" title="点击重置">' + fmtClock(timer.left) + "</span>" +
      '<button class="timer-btn" data-act="timer-toggle" aria-label="开始或暂停计时">' +
      (timer.running ? "❚❚" : "▶") + "</button></div>" +
      "</div></div></header>" +
      '<div class="shell">' + (storageOK ? "" : warnBar()) + body + "</div>" +
      '<nav class="tabbar">' + tabs + "</nav>" +
      '<div class="toast-wrap" id="toasts"></div>';

    document.title =
      v === "study"
        ? "学习中 · 记忆卡片盒"
        : "(" + doneToday + "/" + S.set.dailyNew + ") 记忆卡片盒";

    const sp = $("#spell");
    if (sp) sp.focus();
  }

  function warnBar() {
    return (
      '<div class="warnbar"><b>这个浏览器不让网页保存数据。</b>' +
      "学完刷新就没了 —— 请改用「启动手机版」给出的局域网地址打开，" +
      "或在电脑上双击这个文件。</div>"
    );
  }

  /* ========== 路由 ========== */
  function go(view) {
    S.ui = view;
    if (view !== "study" && session) {
      session = null;
    }
    try {
      const h = view === "today" ? "" : "#" + view;
      if (location.hash !== h) {
        history.replaceState(null, "", location.pathname + location.search + h);
      }
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  /* ========== 事件 ========== */
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;

    if (act === "go") {
      go(el.dataset.view);
      return;
    }
    if (act === "start") {
      startSession(0);
      return;
    }
    if (act === "extra") {
      startSession(10);
      return;
    }
    if (act === "flip") {
      if (!session) return;
      session.revealed = true;
      session.stage = "back";
      render();
      return;
    }
    if (act === "speak") {
      speak(el.dataset.text);
      return;
    }
    if (act === "grade") {
      answer(Number(el.dataset.g));
      return;
    }
    if (act === "check") {
      checkSpelling();
      return;
    }
    if (act === "next") {
      if (session && session.stage === "spellResult") {
        answer(session.spellResult ? 3 : 1);
      }
      return;
    }
    if (act === "end") {
      if (session) {
        const s = session;
        session = null;
        S.ui = "today";
        render();
        toast("本轮中断：" + s.done + " 张。没做完的明天还会再来。", "warn");
      } else {
        go("today");
      }
      return;
    }
    if (act === "timer-toggle") {
      timer.running ? timerStop() : timerStart();
      return;
    }
    if (act === "timer-reset") {
      timerReset();
      return;
    }
    if (act === "toggle-spell") {
      S.set.spelling = !S.set.spelling;
      save();
      render();
      return;
    }
    if (act === "spell-toggle") {
      S.set.spelling = !S.set.spelling;
      save();
      render();
      return;
    }
    if (act === "filter") {
      wordFilter = el.dataset.f;
      render();
      return;
    }
    if (act === "sync-gen") {
      S.set.syncCode = newSyncCode();
      S.set.syncOn = true;
      S.sync.rev = 0;
      S.sync.at = 0;
      S.sync.err = false;
      persist();
      render();
      toast("同步码已生成。在另一台设备上填同一个码就行。");
      pullNow(true);
      return;
    }
    if (act === "sync-save") {
      const el = $("#sync-code");
      const v = el ? el.value.trim().toLowerCase() : "";
      if (v && !/^[a-z0-9]{16,64}$/.test(v)) {
        toast("同步码要 16 位以上字母或数字。", "warn");
        return;
      }
      S.set.syncCode = v;
      S.set.syncOn = !!v;
      S.sync.rev = 0;
      S.sync.at = 0;
      S.sync.err = false;
      persist();
      render();
      if (v) {
        toast("正在同步…");
        pullNow();
      } else {
        toast("已关闭同步，回到只存本机。");
      }
      return;
    }
    if (act === "export") {
      exportData();
      return;
    }
    if (act === "import") {
      importData();
      return;
    }
    if (act === "import-words") {
      importWords();
      return;
    }
    if (act === "reset") {
      if (confirm("确定清空所有学习数据？这个操作无法撤销。")) {
        try {
          localStorage.removeItem(KEY);
        } catch (err) {}
        location.reload();
      }
      return;
    }
  });

  document.addEventListener("change", function (e) {
    const el = e.target.closest("[data-set]");
    if (!el) return;
    const k = el.dataset.set;
    let v = el.value;
    if (el.dataset.num === "1") v = Number(v);
    S.set[k] = v;
    save();
    if (k === "deck") {
      rebuildWords();
      session = null;
    }
    render();
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "word-search") {
      wordQuery = e.target.value;
      const list = $("#word-list");
      if (list) list.innerHTML = wordListHTML();
    }
  });

  document.addEventListener("keydown", function (e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";

    if (typing && e.target.id === "spell") {
      if (e.key === "Enter") {
        e.preventDefault();
        checkSpelling();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (session) {
          session.stage = "back";
          session.revealed = true;
          render();
        }
      }
      return;
    }

    if (typing) return;
    if (!session || S.ui !== "study") return;

    if (e.code === "Space") {
      e.preventDefault();
      if (session.stage === "front" || !session.revealed) {
        session.revealed = true;
        session.stage = "back";
        render();
      }
      return;
    }
    if (e.key === "1" || e.key === "2" || e.key === "3") {
      if (session.stage === "back" && session.revealed) {
        e.preventDefault();
        speak(currentWord() ? currentWord().w : "");
        answer(Number(e.key));
      }
      return;
    }
    if (e.key === "Enter" && session.stage === "spellResult") {
      e.preventDefault();
      answer(session.spellResult ? 3 : 1);
    }
  });

  function checkSpelling() {
    if (!session) return;
    const w = currentWord();
    const input = $("#spell");
    if (!w || !input) return;
    const val = input.value.trim().toLowerCase();
    if (!val) {
      toast("先写点什么，或者按 Esc 直接看答案。", "warn");
      return;
    }
    session.spellResult = val === w.id;
    session.stage = "spellResult";
    render();
    toast(session.spellResult ? "拼对了。" : "差一点。多读两遍再拼一次。", session.spellResult ? "" : "warn");
  }

  /* ========== 数据导入导出 ========== */
  function download(name, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 500);
  }

  function exportData() {
    download("记忆卡片盒-备份-" + todayKey() + ".json", JSON.stringify(S, null, 2));
    toast("已导出备份文件。");
  }

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = function () {
        try {
          const obj = JSON.parse(String(r.result));
          if (!obj || !obj.prog) throw new Error("bad");
          if (!confirm("导入会覆盖当前进度，确定吗？")) return;
          S = {
            v: 1,
            prog: obj.prog || {},
            custom: obj.custom || [],
            daily: obj.daily || {},
            set: Object.assign({}, DEFAULT_SET, obj.set || {}),
            meta: Object.assign({}, { created: todayKey(), lastActive: "", bestStreak: 0 }, obj.meta || {}),
            timer: Object.assign({}, { left: 25 * 60, mode: "focus" }, obj.timer || {}),
          };
          save();
          rebuildWords();
          toast("导入成功。");
          render();
        } catch (err) {
          toast("这个文件读不出来。", "warn");
        }
      };
      r.readAsText(f);
    };
    input.click();
  }

  function importWords() {
    const raw = prompt(
      "每行一个词。格式：\nword 中文释义\n或 CSV：word,词性,释义,例句,例句翻译",
      ""
    );
    if (!raw) return;
    const added = [];
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      let parts = s.split("\t");
      if (parts.length < 2) parts = s.split(",");
      if (parts.length < 2) {
        const m = s.match(/^([A-Za-z][A-Za-z'\- ]*?)\s+(.+)$/);
        if (m) parts = [m[1], m[2]];
      }
      if (parts.length < 2) return;
      const w = parts[0].trim();
      if (!/^[A-Za-z][A-Za-z'\- ]*$/.test(w)) return;
      if (parts.length >= 3 && /^(n|v|adj|adv|prep|conj|pron|num|art)\./.test(parts[1].trim())) {
        added.push([w, parts[1].trim(), parts[2].trim(), (parts[3] || "").trim(), (parts[4] || "").trim()]);
      } else {
        added.push([w, "", parts.slice(1).join(",").trim(), "", ""]);
      }
    });
    if (!added.length) {
      toast("没认出格式。每行至少要有「单词 + 释义」。", "warn");
      return;
    }
    S.custom = S.custom.concat(added);
    if (S.set.deck === "all") {
      /* 保持全部范围 */
    }
    rebuildWords();
    save();
    toast("导入 " + added.length + " 个词。");
    render();
  }

  /* ========== 定时监督 ========== */
  let lastAction = Date.now();

  let lastWidth = window.innerWidth;
  let resizeT = null;
  window.addEventListener("resize", function () {
    if (Math.abs(window.innerWidth - lastWidth) < 40) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeT);
    resizeT = setTimeout(render, 180);
  });

  setInterval(function () {
    timerTick();
  }, 1000);

  setInterval(function () {
    if (S.ui === "study" && session) {
      if (Date.now() - lastAction > 9 * 60 * 1000) {
        toast("这张卡放了很久了。想不起来就翻，翻完继续。", "warn");
        lastAction = Date.now();
      }
    }
  }, 60000);

  setInterval(function () {
    if (S.ui === "today") {
      const coach = $(".coach-msg");
      if (coach) coach.innerHTML = coachLine();
      const pill = $(".streak-pill b");
      if (pill) pill.textContent = streak();
    }
  }, 30000);

  ["click", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      lastAction = Date.now();
      S.meta.lastActive = todayKey();
    }, { passive: true });
  });

  /* ========== 启动 ========== */
  S.ui = "today";
  try {
    const h = (location.hash || "").replace("#", "");
    if (h && TABS.some((t) => t[0] === h)) S.ui = h;
  } catch (e) {}
  touchBest();
  render();

  window.addEventListener("pagehide", function () {
    if (syncable()) pushNow();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && syncable()) pushNow();
  });
  if (syncable()) setTimeout(() => pullNow(true), 500);
})();
