/* 小程序反应时补丁 */
const fs = require("fs");
const path = require("path");
const p = path.resolve(__dirname, "..", "miniapp", "pages", "study", "study.js");
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

/* 1. 出卡时记时间 */
rep("    this.setData(patch);", "    this._shownAt = Date.now();\n    this.setData(patch);", "记录出卡时间");

/* 2. 打分时带反应时 */
rep("    store.gradeWord(id, g);", "    const ms = this._shownAt ? Date.now() - this._shownAt : 0;\n    store.gradeWord(id, g, ms);", "打分带反应时");

/* 3. 拼写结果带用时 */
rep(
  'this.setData({ spellOk: v === this.data.word.toLowerCase(), stage: "spellResult" });',
  'this.setData({ spellOk: v === this.data.word.toLowerCase(), rtText: this.rtText(), stage: "spellResult" });',
  "拼写结果带用时"
);

/* 4. 选择题/填空结果带用时（两处 stage: "quizResult"） */
rep('      stage: "quizResult",', '      rtText: this.rtText(),\n      stage: "quizResult",', "答题结果带用时");

/* 5. rtText 方法 */
rep(
  "  onGrade(e) {",
  "  rtText() {\n" +
    "    if (!this._shownAt) return '';\n" +
    "    const s = (Date.now() - this._shownAt) / 1000;\n" +
    "    return ' · 用时 ' + (s >= 10 ? Math.round(s) + ' 秒' : s.toFixed(1) + ' 秒');\n" +
    "  },\n\n" +
    "  onGrade(e) {",
  "rtText 方法"
);

/* 6. data 里加 rtText */
rep('    memoAuto: "",', '    memoAuto: "",\n    rtText: "",', "data 加 rtText");

fs.writeFileSync(p, t, "utf8");
console.log("改动", n, "处");
