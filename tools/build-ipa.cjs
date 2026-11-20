/* 把 ipa-dict 转成我们用的 ipa.json（word -> 音标）
 * 美国词典优先，英国词典兜底；统一成课本常见的符号写法。
 *
 * 注意：源文件里的 IPA 特殊字符一律用 \u 转义写，
 * 免得经过某些编辑器/PowerShell 时被编码转换弄坏。
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const words = Object.keys(
  JSON.parse(fs.readFileSync(path.join(root, "server", "words.json"), "utf8"))
);

function load(file) {
  const p = path.join(process.env.TEMP, file);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const w = line.slice(0, tab).trim().toLowerCase();
    const raw = line.slice(tab + 1).trim();
    if (!w || !raw || map.has(w)) continue;
    /* 取第一条，去掉首尾斜杠 */
    map.set(w, raw.split(",")[0].trim().replace(/^\/|\/$/g, ""));
  }
  return map;
}

const us = load("en_US.txt");
const uk = load("en_UK.txt");

/* 统一写法：课本用 l / r / g，不用 \u026B / \u0279 / \u0261 */
function norm(s) {
  return s
    .replace(/\u026B/g, "l")
    .replace(/\u0279/g, "r")
    .replace(/\u0261/g, "g")
    .replace(/\s+/g, " ")
    .trim();
}

/* 英式拼写 → 词典里的美式写法 */
const SPELL = {
  maths: "math",
  organiser: "organizer",
  organise: "organize",
  offence: "offense",
  omelette: "omelet",
  litre: "liter",
  labourer: "laborer",
  aeroplane: "airplane",
  sceptical: "skeptical",
  analyse: "analyze",
  yoghurt: "yogurt",
  waggon: "wagon",
  gramme: "gram",
  gaol: "jail",
  reflexion: "reflection",
  cigaret: "cigarette",
  sideway: "sideways",
  "passer-by": "passerby",
  "world-wide": "worldwide",
  "chain stores": "chain store",
};

/* 词典实在没有的，手工补 */
const DIRECT = {
  "used to": "\u02c8just t\u0259",
  "passer-by": "\u02ccp\u00e6s\u0259r\u02c8ba\u026a",
  preposition: "\u02ccpr\u025bp\u0259\u02c8z\u026a\u0283\u0259n",
  handtruck: "\u02c8h\u00e6nd\u02cctr\u028ck",
  beddings: "\u02c8b\u025bd\u026a\u014bz",
  systematical: "\u02ccs\u026ast\u0259\u02c8m\u00e6t\u026ak\u0259l",
  accessary: "\u0259k\u02c8s\u025bs\u0259ri",
  impermanency: "\u026am\u02c8p\u025crm\u0259n\u0259nsi",
  reframe: "\u02ccri\u02c8fre\u026am",
  groundlessly: "\u02c8gra\u028andl\u0259sli",
  vcd: "\u02ccvi si \u02c8di",
  rusia: "\u02c8r\u028c\u0283\u0259",
  "chain store": "\u02c8t\u0283e\u026an \u02ccst\u0254r",
  "chain stores": "\u02c8t\u0283e\u026an \u02ccst\u0254rz",
  "up-to-date": "\u02cc\u028cp t\u0259 \u02c8de\u026at",
};

const out = {};
const miss = [];
for (const w of words) {
  const k = w.toLowerCase();
  let ipa = us.get(k) || uk.get(k);
  if (!ipa && SPELL[k]) ipa = us.get(SPELL[k]) || uk.get(SPELL[k]);
  if (!ipa && DIRECT[k]) ipa = DIRECT[k];
  if (ipa) out[k] = norm(ipa);
  else miss.push(w);
}

const file = path.join(root, "web", "ipa.json");
fs.writeFileSync(file, JSON.stringify(out), "utf8");
console.log("写入 web/ipa.json:", (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0) + "KB");
console.log(
  "有音标:",
  Object.keys(out).length,
  "/",
  words.length,
  "(" + ((Object.keys(out).length / words.length) * 100).toFixed(1) + "%)"
);
console.log("仍缺", miss.length, "个:", miss.join(", "));
console.log("\n样例:");
for (const s of ["hello", "apple", "quite", "beautiful", "useful", "group", "believe", "x-ray"]) {
  console.log("  " + s.padEnd(12), out[s] || "(无)");
}
