const DAY = 86400000;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 下一次间隔（天） */
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

/** 打分，返回新的进度对象 */
function apply(p, g) {
  const now = Date.now();
  const out = Object.assign(
    { e: 2.5, i: 0, r: 0, due: now, lapses: 0, born: now, seen: now },
    p || {}
  );
  if (g === 1) {
    out.e = clamp(out.e - 0.2, 1.3, 3.0);
    out.i = 10 / 1440;
    out.r = 0;
    out.lapses += 1;
  } else if (g === 2) {
    out.e = clamp(out.e - 0.05, 1.3, 3.0);
    out.i = out.i < 1 ? 1 : Math.min(out.i * 1.5, 200);
    out.r += 1;
  } else {
    out.e = clamp(out.e + 0.1, 1.3, 3.0);
    out.i = out.i === 0 ? 1 : Math.min(out.i * out.e, 200);
    out.r += 1;
  }
  out.due = now + out.i * DAY;
  out.seen = now;
  return out;
}

/** 记忆保持率：指数衰减 */
function retention(p) {
  if (!p) return 0;
  const t = (Date.now() - (p.seen || Date.now())) / DAY;
  const strength = Math.max(0.6, (p.i || 0.6) * 1.6);
  return Math.exp(-t / strength);
}

module.exports = { DAY, nextInterval, fmtDays, apply, retention };
