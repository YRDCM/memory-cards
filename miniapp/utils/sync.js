const store = require("./store.js");

/* 换成你自己的域名时，记得在小程序后台把它加进 request 合法域名 */
const API = "https://mystarwhisper.cn/english/api";

let pushing = false;
let pullTimer = null;

function request(method, url, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: method,
      data: data,
      header: { "content-type": "application/json" },
      timeout: 15000,
      success: (res) => resolve(res),
      fail: (err) => reject(err),
    });
  });
}

function stateUrl(code) {
  return API + "/state?code=" + encodeURIComponent(code);
}

function enabled() {
  const S = store.state();
  return !!S.set.syncCode && S.set.syncOn !== false;
}

/** 合并：每个词取最近复习的那份 */
function merge(local, remote) {
  if (!remote || !remote.prog) return null;
  const prog = Object.assign({}, remote.prog);
  Object.keys(local.prog).forEach((k) => {
    const a = local.prog[k];
    const b = prog[k];
    if (!b || (a.seen || 0) >= (b.seen || 0)) prog[k] = a;
  });

  const rd = remote.daily || {};
  const keys = Object.keys(local.daily);
  Object.keys(rd).forEach((k) => {
    if (keys.indexOf(k) < 0) keys.push(k);
  });
  const daily = {};
  keys.forEach((k) => {
    const a = local.daily[k] || {};
    const b = rd[k] || {};
    daily[k] = {
      cards: Math.max(a.cards || 0, b.cards || 0),
      sec: Math.max(a.sec || 0, b.sec || 0),
      newW: Math.max(a.newW || 0, b.newW || 0),
      reviews: Math.max(a.reviews || 0, b.reviews || 0),
      correct: Math.max(a.correct || 0, b.correct || 0),
    };
  });

  const seen = {};
  const custom = [];
  (local.custom || []).concat(remote.custom || []).forEach((w) => {
    const id = String((w && w[0]) || "").toLowerCase();
    if (!id || seen[id]) return;
    seen[id] = 1;
    custom.push(w);
  });

  return {
    prog: prog,
    daily: daily,
    custom: custom,
    bestStreak: Math.max(
      local.meta.bestStreak || 0,
      (remote.meta && remote.meta.bestStreak) || 0
    ),
  };
}

function apply(merged) {
  const S = store.state();
  S.prog = merged.prog;
  S.daily = merged.daily;
  S.custom = merged.custom;
  S.meta.bestStreak = merged.bestStreak;
  store.rebuild();
  store.save();
}

function exportState() {
  const S = store.state();
  return { v: 1, prog: S.prog, custom: S.custom, daily: S.daily, set: S.set, meta: S.meta };
}

async function push() {
  if (!enabled() || pushing) return { ok: false, skipped: true };
  const S = store.state();
  pushing = true;
  try {
    let res = await request("PUT", stateUrl(S.set.syncCode), {
      rev: S.sync.rev || 0,
      state: exportState(),
    });
    if (res.statusCode === 409 && res.data && res.data.state) {
      if ((res.data.rev || 0) > (S.sync.rev || 0)) {
        const m = merge(S, res.data.state);
        if (m) apply(m);
        S.sync.rev = res.data.rev || 0;
      }
      res = await request("PUT", stateUrl(S.set.syncCode), {
        rev: S.sync.rev || 0,
        state: exportState(),
      });
    }
    if (res.statusCode === 200 && res.data) {
      S.sync.rev = res.data.rev || 0;
      S.sync.at = Date.now();
      S.sync.err = false;
      store.save();
      pushing = false;
      return { ok: true };
    }
    S.sync.err = true;
    store.save();
    pushing = false;
    return { ok: false, status: res.statusCode };
  } catch (e) {
    S.sync.err = true;
    store.save();
    pushing = false;
    return { ok: false, error: e };
  }
}

async function pull() {
  if (!enabled()) return { ok: false, skipped: true };
  const S = store.state();
  try {
    const res = await request("GET", stateUrl(S.set.syncCode));
    if (res.statusCode === 404) {
      S.sync.rev = 0;
      return push();
    }
    if (res.statusCode !== 200 || !res.data || !res.data.state) {
      S.sync.err = true;
      store.save();
      return { ok: false, status: res.statusCode };
    }
    const m = merge(S, res.data.state);
    if (m) apply(m);
    S.sync.rev = res.data.rev || 0;
    S.sync.at = Date.now();
    S.sync.err = false;
    store.save();
    await push();
    return { ok: true };
  } catch (e) {
    S.sync.err = true;
    store.save();
    return { ok: false, error: e };
  }
}

/** 学习过程中节流推送：改动后 30 秒，或距上次同步超过 2 分钟时 3 秒内推 */
function schedule() {
  if (!enabled()) return;
  const S = store.state();
  const stale = Date.now() - (S.sync.at || 0) > 120000;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    push();
  }, stale ? 3000 : 30000);
}

function newCode() {
  const CH = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 24; i++) out += CH[Math.floor(Math.random() * CH.length)];
  return out;
}

function statusText() {
  const S = store.state();
  if (!S.set.syncCode) return "未启用。填一个同步码，手机和电脑就能共用进度。";
  if (S.sync.err) return "同步失败 —— 检查网络，或确认后台已配置服务器域名。";
  if (!S.sync.at) return "已填写同步码，等待第一次同步…";
  const d = new Date(S.sync.at);
  return (
    "已同步 · " +
    (d.getHours() < 10 ? "0" : "") +
    d.getHours() +
    ":" +
    (d.getMinutes() < 10 ? "0" : "") +
    d.getMinutes() +
    " · 同步码就是密码，别外传"
  );
}

module.exports = { push, pull, schedule, newCode, statusText, enabled, merge };
