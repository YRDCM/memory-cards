import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const P = (f) => path.join(here, f);

const POS_SEQ = /^((?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|modal)\.\s*(?:[&/,、]\s*)?)+)/i;

function clean(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/[；;]\s*$/, "")
    .trim();
}

function splitPos(meaning) {
  const m = POS_SEQ.exec(meaning);
  if (!m) return { pos: "", cn: meaning };
  const pos = m[1].replace(/[\s&/,、]+$/, "").replace(/\.\s*([&/,])/g, ". $1").trim();
  const cn = meaning.slice(m[0].length).trim();
  if (!cn) return { pos: "", cn: meaning };
  return { pos, cn };
}

function readTxt(file) {
  const out = [];
  const seen = new Set();
  for (const line of fs.readFileSync(P(file), "utf8").split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const w = line.slice(0, tab).trim();
    const raw = clean(line.slice(tab + 1));
    if (!w || !raw) continue;
    if (!/^[a-z][a-z'\- ]*$/i.test(w)) continue;
    const id = w.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const sp = splitPos(raw);
    if (!sp.cn) continue;
    out.push({ w, pos: sp.pos, cn: sp.cn });
  }
  return out;
}

/* 例句：优先完整句（大写开头 + 标点结尾），其次最短 */
function readSent(file) {
  const map = new Map();
  if (!fs.existsSync(P(file))) return map;
  for (const line of fs.readFileSync(P(file), "utf8").split("\n")) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const w = String(o.word || "").trim().toLowerCase();
    if (!w || map.has(w)) continue;
    const arr = Array.isArray(o.sentences) ? o.sentences : [];
    const cands = [];
    for (const s of arr) {
      const en = String(s.sentence || "").replace(/\s+([.,!?;])/g, "$1").trim();
      const cn = String(s.translation || "").trim();
      if (!en || !cn) continue;
      const words = en.split(/\s+/).length;
      if (words < 5 || words > 14 || en.length > 86) continue;
      const full = /^["A-Z]/.test(en) && /[.?!]["']?$/.test(en);
      cands.push({ en, cn, full, len: en.length });
    }
    cands.sort((a, b) => b.full - a.full || a.len - b.len);
    if (cands.length) map.set(w, { en: cands[0].en, cn: cands[0].cn });
  }
  return map;
}

/* 首字母轮转，避免从 A 一路背到 Z */
function order(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = r[0][0].toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const letters = [...groups.keys()].sort();
  const out = [];
  for (let i = 0; out.length < rows.length; i++) {
    let pushed = false;
    for (const L of letters) {
      const g = groups.get(L);
      if (i < g.length) {
        out.push(g[i]);
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return out;
}

const DECKS = [
  { name: "初中", txt: "raw/chuzhong.txt", sent: "raw/chuzhong-sentence.jsonl", file: "deck1.js", varName: "DECK1" },
  { name: "高中", txt: "raw/gaozhong.txt", sent: "raw/high-sentence.jsonl", file: "deck2.js", varName: "DECK2" },
  { name: "四级", txt: "raw/siji.txt", sent: "raw/cet4-sentence.jsonl", file: "deck3.js", varName: "DECK3" },
];

let total = 0;
let totalBytes = 0;
const all = new Set();
const wordMap = {};

for (const d of DECKS) {
  const words = readTxt(d.txt);
  const sent = readSent(d.sent);
  const rows = words.map((x) => {
    const ex = sent.get(x.w.toLowerCase());
    return [x.w, x.pos, x.cn, ex ? ex.en : "", ex ? ex.cn : ""];
  });
  const ordered = order(rows);
  const withEx = ordered.filter((r) => r[3]).length;

  const js =
    "/* " + d.name + "词汇 · " + ordered.length + " 词 */\nconst " + d.varName + " = [\n" +
    ordered.map((r) => JSON.stringify(r)).join(",\n") +
    "\n];\n";
  fs.writeFileSync(P(d.file), js, "utf8");

  /* 同一份数据再输出一份给小程序（CommonJS 格式） */
  const mpJs = js.replace(/^[\s\S]*?const\s+\w+\s*=\s*/, "module.exports = ");
  fs.writeFileSync(P(path.join("..", "miniapp", "data", d.file)), mpJs, "utf8");

  const bytes = Buffer.byteLength(js);
  total += ordered.length;
  totalBytes += bytes;
  ordered.forEach((r) => all.add(r[0].toLowerCase()));
  ordered.forEach((r) => {
    const id = r[0].toLowerCase();
    if (!wordMap[id]) wordMap[id] = { p: r[1], c: r[2] };
  });

  console.log(
    d.name.padEnd(3),
    "词条", String(ordered.length).padStart(5),
    " 例句", String(withEx).padStart(5),
    "(" + Math.round((withEx / ordered.length) * 100) + "%)",
    " 文件", (bytes / 1024).toFixed(0) + "KB"
  );
}

console.log("\n合计词条（含跨库重复）:", total);
console.log("合计去重后:", all.size);
console.log("三个 deck 合计体积:", (totalBytes / 1024 / 1024).toFixed(2), "MB");

/* 词义表：给服务器上的学习报告脚本用（大肥鱼考单词时查答案） */
const wj = JSON.stringify(wordMap);
fs.writeFileSync(P(path.join("..", "server", "words.json")), wj, "utf8");
console.log("词义表 server/words.json:", (Buffer.byteLength(wj) / 1024).toFixed(0), "KB，", Object.keys(wordMap).length, "词");
