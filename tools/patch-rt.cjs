/* 反应时补丁：pick / cloze-check 记录用时；quiz-next 慢就降档 */
const fs = require("fs");
const path = require("path");

const p = path.resolve(__dirname, "..", "web", "app.js");
let t = fs.readFileSync(p, "utf8");
let changed = 0;

function rep(re, to, label) {
  const before = t;
  t = t.replace(re, to);
  const ok = before !== t;
  console.log((ok ? "✓" : "✗") + " " + label);
  if (ok) changed++;
}

/* 1. 选择题作答：记录反应时 */
rep(
  /(session\.picked = i;\r?\n)(\s*)(session\.lastOk = i === session\.correctIdx;)/,
  "$1$2session.elapsed = Date.now() - (session.shownAt || Date.now());$1$2$3",
  "pick 记录用时"
);

/* 2. 填空作答：记录反应时 */
rep(
  /(const c = session\.cloze \|\| \{\};\r?\n)(\s*)(session\.lastOk = v === c\.answer)/,
  "$1$2session.elapsed = Date.now() - (session.shownAt || Date.now());$1$2$3",
  "cloze 记录用时"
);

/* 3. 结果页继续：慢就按「模糊」处理 */
rep(
  /(session\.stage !== "quizResult"\) return;\r?\n\s*)answer\(session\.lastOk \? 3 : 1\);/,
  "$1answer(gradedForObjective());",
  "quiz-next 用反应时判定"
);

/* 4. 插入 gradedForObjective 与阈值 */
rep(
  /(\s*)function startSession\(/,
  "\n  /* 客观题答对但太慢 → 按「模糊」处理，间隔不会跳太远 */\n" +
    "  const SLOW_MS = { choice: 8000, cloze: 20000, spell: 20000 };\n" +
    "  function gradedForObjective() {\n" +
    "    if (!session || !session.lastOk) return 1;\n" +
    "    const limit = SLOW_MS[session.mode] || 8000;\n" +
    "    const ms = session.elapsed || 0;\n" +
    "    return ms > limit ? 2 : 3;\n" +
    "  }\n\n" +
    "  function startSession(",
  "插入 gradedForObjective"
);

fs.writeFileSync(p, t, "utf8");
console.log("改动", changed, "处");
