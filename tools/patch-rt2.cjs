/* 反应时显示补丁 */
const fs = require("fs");
const path = require("path");
const p = path.resolve(__dirname, "..", "web", "app.js");
let t = fs.readFileSync(p, "utf8");
let n = 0;

function rep(from, to, label) {
  if (t.indexOf(from) < 0) {
    console.log("✗ " + label);
    return;
  }
  t = t.split(from).join(to);
  n++;
  console.log("✓ " + label);
}

rep(
  '" · " + (ok ? "✓ 拼对了" : "✗ 正确写法是这样") + "</div>" +',
  '" · " + (ok ? "✓ 拼对了" : "✗ 正确写法是这样") + rtMeta() + "</div>" +',
  "拼写结果加用时"
);

rep(
  'posHTML(w.pos, ok ? "✓ 答对了" : "✗ 没答对") +',
  'posHTML(w.pos, (ok ? "✓ 答对了" : "✗ 没答对") + rtMeta()) +',
  "答题结果加用时"
);

const anchor = "  function gradeWord(id, g, ms) {";
if (t.indexOf(anchor) >= 0) {
  const helper = [
    "  /* 结果页显示反应时 */",
    "  function rtMeta() {",
    "    if (!session || !session.elapsed) return \"\";",
    "    const s = session.elapsed / 1000;",
    "    const limit = SLOW_MS[session.mode] || 0;",
    "    const slow = session.lastOk && limit && session.elapsed > limit;",
    "    return \" · 用时 \" + (s >= 10 ? Math.round(s) + \" 秒\" : s.toFixed(1) + \" 秒\") + (slow ? \"（偏慢）\" : \"\");",
    "  }",
    "",
  ].join("\n");
  t = t.replace(anchor, helper + anchor);
  n++;
  console.log("✓ 插入 rtMeta");
} else {
  console.log("✗ 插入 rtMeta");
}

fs.writeFileSync(p, t, "utf8");
console.log("改动", n, "处");
