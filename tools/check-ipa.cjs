/* 检查 ipa-dict 对我们 5662 个词的覆盖率 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ipaFile = path.join(process.env.TEMP, "en_US.txt");
const wordsFile = path.join(root, "server", "words.json");

const lines = fs.readFileSync(ipaFile, "utf8").split("\n");
const ipa = new Map();
for (const line of lines) {
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  const w = line.slice(0, tab).trim().toLowerCase();
  const p = line.slice(tab + 1).trim();
  if (!w || !p) continue;
  // 一个词可能有多条，取第一条
  if (!ipa.has(w)) ipa.set(w, p);
}

const words = Object.keys(JSON.parse(fs.readFileSync(wordsFile, "utf8")));
let hit = 0;
const miss = [];
for (const w of words) {
  const key = w.toLowerCase();
  if (ipa.has(key)) hit++;
  else miss.push(w);
}

console.log("字典条目:", ipa.size);
console.log("我们的词:", words.length);
console.log("命中:", hit, " 覆盖率:", ((hit / words.length) * 100).toFixed(1) + "%");
console.log("缺失:", miss.length);
console.log("缺失样例:", miss.slice(0, 40).join(", "));

const sample = ["hello", "apple", "quite", "beautiful", "group", "useful", "x-ray", "believe"];
console.log("\n样例:");
for (const s of sample) console.log("  " + s.padEnd(12), ipa.get(s) || "(无)");
