/* 原型：用词库数据自动生成联想，先看质量
 * 数据来源：单词内部是否藏着另一个认识的词 / 词缀拆解 / 词族
 */
const path = require("path");
const root = path.resolve(__dirname, "..");
const d1 = require(path.join(root, "miniapp/data/deck1.js"));
const d2 = require(path.join(root, "miniapp/data/deck2.js"));
const d3 = require(path.join(root, "miniapp/data/deck3.js"));

const MAP = new Map();
for (const arr of [d1, d2, d3]) {
  for (const row of arr) {
    const id = String(row[0]).trim().toLowerCase();
    if (!MAP.has(id)) MAP.set(id, { w: row[0], cn: row[2], pos: row[1] });
  }
}

function short(cn) {
  let s = String(cn || "");
  s = s.replace(/\[[^\]]*\]/g, " ");          // 去掉词形表 [broke-broken]
  s = s.replace(/\((?:[^)]*)\)/g, " ");       // 去掉括号补充
  s = s.split(/[；;，,、]/)[0].trim();
  if (!/[\u4e00-\u9fa5]/.test(s)) return "";   // 没有中文就不要
  return s.slice(0, 8);
}

/* 词中词：优先长词，其次靠词首/词尾 */
function innerWord(id) {
  let best = null;
  for (let len = Math.min(7, id.length - 2); len >= 3; len--) {
    for (let i = 0; i + len <= id.length; i++) {
      const sub = id.slice(i, i + len);
      if (sub === id) continue;
      const hit = MAP.get(sub);
      if (!hit) continue;
      if (!short(hit.cn)) continue;
      const edge = i === 0 || i + len === id.length ? 1 : 0;
      const score = len * 2 + edge;
      if (!best || score > best.score) best = { sub, hit, score, edge };
    }
  }
  return best;
}

const PREFIX = { un: "不", re: "再", dis: "相反", non: "非", pre: "预先", post: "之后", over: "过度", under: "不足", mis: "错误地", out: "向外", anti: "反对", auto: "自动", multi: "多", sub: "下面", super: "超越", semi: "半", mini: "小", mid: "中间", inter: "之间" };
const SUFFIX = { tion: "名词", ment: "名词", ness: "名词", ity: "名词", able: "能…的", ible: "能…的", ful: "充满…的", less: "无…的", ly: "副词", er: "人/物", ist: "人", ism: "主义", ize: "使…", ous: "有…性质", ive: "形容词", al: "形容词", ic: "形容词", ship: "身份", hood: "身份" };

function splitWord(id) {
  for (const p in PREFIX) {
    if (id.length - p.length < 3) continue;
    if (id.indexOf(p) !== 0) continue;
    const rest = id.slice(p.length);
    if (!MAP.has(rest)) continue;
    return [{ t: p, g: PREFIX[p] }, { t: rest, g: short(MAP.get(rest).cn) }];
  }
  for (const s in SUFFIX) {
    if (id.length - s.length < 3) continue;
    if (id.slice(-s.length) !== s) continue;
    const base = id.slice(0, id.length - s.length);
    const hit = MAP.has(base) ? base : MAP.has(base + "e") ? base + "e" : null;
    if (!hit) continue;
    return [{ t: hit, g: short(MAP.get(hit).cn) }, { t: s, g: SUFFIX[s] }];
  }
  return null;
}

function autoMemo(row) {
  const id = String(row[0]).toLowerCase();
  const parts = splitWord(id);
  if (parts && parts[0].g && parts[1].g) {
    return "拆开：" + parts[0].t + "（" + parts[0].g + "）+ " + parts[1].t + "（" + parts[1].g + "）";
  }
  const inner = innerWord(id);
  if (inner && inner.edge) {
    return "里面藏着 " + inner.sub + "（" + short(inner.hit.cn) + "）——先记住这个词，再往外扩";
  }
  if (inner) {
    return "中间有 " + inner.sub + "（" + short(inner.hit.cn) + "）";
  }
  const fam = [];
  for (const [k, v] of MAP) {
    if (k === id || k.length < 4) continue;
    if (k.indexOf(id) === 0 || id.indexOf(k) === 0) {
      if (short(v.cn)) fam.push({ w: v.w, cn: short(v.cn), len: k.length });
    }
    if (fam.length >= 3) break;
  }
  if (fam.length) {
    fam.sort((a, b) => b.len - a.len);
    return "同族：" + fam.slice(0, 2).map((x) => x.w + "（" + x.cn + "）").join("、") + "——词形相近，一起记";
  }
  return "";
}

/* 统计覆盖率 + 抽样 */
const all = [];
for (const arr of [d1, d2, d3]) for (const r of arr) if (!all.some((x) => x[0] === r[0])) all.push(r);

let covered = 0;
const byKind = { split: 0, inner: 0, ex: 0, none: 0 };
for (const r of all) {
  const id = String(r[0]).toLowerCase();
  if (splitWord(id)) { byKind.split++; covered++; }
  else if (innerWord(id)) { byKind.inner++; covered++; }
  else if (r[3]) { byKind.ex++; covered++; }
  else byKind.none++;
}
console.log("总词数", all.length);
console.log("拆解", byKind.split, "· 词中词", byKind.inner, "· 仅例句", byKind.ex, "· 全无", byKind.none);
console.log("覆盖率", ((covered / all.length) * 100).toFixed(1) + "%\n");

const sample = ["island", "business", "season", "breakfast", "understand", "happy", "quite", "group", "believe", "manage", "unhappy", "dangerous", "vegetable", "restaurant", "message"];
for (const w of sample) {
  const r = all.find((x) => String(x[0]).toLowerCase() === w);
  console.log(w.padEnd(12), r ? autoMemo(r) : "(不在词库)");
}
