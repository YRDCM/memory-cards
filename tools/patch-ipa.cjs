/* 一次性补丁：给每个单词标题后插入音标行 */
const fs = require("fs");
const path = require("path");

const p = path.resolve(__dirname, "..", "web", "app.js");
let t = fs.readFileSync(p, "utf8");

const pairs = [
  [
    '\'<div class="fc-word" style="color:\' + (ok ? "#2e7d5b" : "#b4472a") + \'">\' + esc(w.w) + "</div>" +',
    '\'<div class="fc-word" style="color:\' + (ok ? "#2e7d5b" : "#b4472a") + \'">\' + esc(w.w) + "</div>" + ipaLine(w) +',
  ],
  [
    '\'<div class="fc-word">\' + esc(w.w) + "</div>" +',
    '\'<div class="fc-word">\' + esc(w.w) + "</div>" + ipaLine(w) +',
  ],
  [
    '\'<div><div class="wm-word">\' + esc(w.w) + "</div>" +',
    '\'<div><div class="wm-word">\' + esc(w.w) + "</div>" + ipaLine(w, "wm-ipa") +',
  ],
];

for (const [from, to] of pairs) {
  const n = t.split(from).length - 1;
  console.log("匹配", n, "处:", from.slice(0, 40));
  t = t.split(from).join(to);
}
fs.writeFileSync(p, t, "utf8");
console.log("完成");
