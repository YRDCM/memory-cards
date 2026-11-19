import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "images");
fs.mkdirSync(OUT, { recursive: true });

const C = { normal: "#6b7c7c", on: "#0f6b5c" };

/* ---------- 四个图标的路径（81×81 画布） ---------- */

function gear(c) {
  const cx = 40.5;
  const cy = 40.5;
  let teeth = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + 17 * Math.cos(a);
    const y1 = cy + 17 * Math.sin(a);
    const x2 = cx + 25 * Math.cos(a);
    const y2 = cy + 25 * Math.sin(a);
    teeth += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="7.5" stroke-linecap="round"/>`;
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="16" stroke="${c}" stroke-width="6.5" fill="none"/>` +
    teeth +
    `<circle cx="${cx}" cy="${cy}" r="6" stroke="${c}" stroke-width="5" fill="none"/>`
  );
}

const ICONS = {
  today: (c) =>
    `<rect x="16" y="19" width="49" height="44" rx="8" stroke="${c}" stroke-width="6" fill="none"/>` +
    `<path d="M28 41 l8.5 8.5 L57 30" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,

  words: (c) =>
    `<line x1="16" y1="21" x2="16" y2="60" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` +
    `<line x1="29" y1="27" x2="62" y2="27" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` +
    `<line x1="29" y1="40.5" x2="62" y2="40.5" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` +
    `<line x1="29" y1="54" x2="51" y2="54" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,

  stats: (c) =>
    `<line x1="22" y1="59" x2="22" y2="44" stroke="${c}" stroke-width="9" stroke-linecap="round"/>` +
    `<line x1="40.5" y1="59" x2="40.5" y2="33" stroke="${c}" stroke-width="9" stroke-linecap="round"/>` +
    `<line x1="59" y1="59" x2="59" y2="22" stroke="${c}" stroke-width="9" stroke-linecap="round"/>`,

  settings: (c) => gear(c),
};

/* ---------- 生成 8 个 HTML + 1 张预览 ---------- */

const NAMES = ["today", "words", "stats", "settings"];
const files = [];

for (const n of NAMES) {
  for (const [state, color] of Object.entries(C)) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 81 81">` +
      ICONS[n](color) +
      `</svg>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;
    const f = `_${n}-${state}.html`;
    fs.writeFileSync(path.join(here, f), html, "utf8");
    files.push({ icon: n, state, file: f, png: `${n}${state === "on" ? "-on" : ""}.png` });
  }
}

/* 预览：真实 tabBar 底色 + 27px 实际显示尺寸 */
const previewCells = NAMES.map((n) => {
  const on = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 81 81" style="width:81px;height:81px">${ICONS[n](C.on)}</svg>`;
  const off = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 81 81" style="width:81px;height:81px">${ICONS[n](C.normal)}</svg>`;
  const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 81 81" style="width:27px;height:27px">${ICONS[n](C.normal)}</svg>`;
  const smallOn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 81 81" style="width:27px;height:27px">${ICONS[n](C.on)}</svg>`;
  return `<div class="cell"><div class="cap">${n}</div><div class="pair">${off}${on}</div><div class="bar"><span>${small}</span><span>${smallOn}</span><span class="lbl">今日</span></div></div>`;
}).join("");

fs.writeFileSync(
  path.join(here, "_preview.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:#fafbf6;font-family:"Microsoft YaHei",sans-serif;color:#16262b}
  h2{font-size:12px;letter-spacing:.14em;color:#6b7c7c;font-family:Consolas,monospace;font-weight:500;margin:0 0 16px}
  .row{display:flex;gap:26px}
  .cell{text-align:center}
  .cap{font-size:11px;color:#6b7c7c;font-family:Consolas,monospace;margin-bottom:6px}
  .pair{display:flex;gap:8px;align-items:center}
  .bar{display:flex;gap:16px;align-items:center;justify-content:center;margin-top:14px;padding:8px 14px;background:#fafbf6;border:1px solid #e4e8dc;border-radius:8px}
  .bar span{display:flex;flex-direction:column;align-items:center}
  .lbl{font-size:9px;color:#6b7c7c;margin-top:2px}
  </style></head><body>
  <h2>81px 原始尺寸（左未选 / 右选中）</h2><div class="row">${previewCells}</div>
  </body></html>`,
  "utf8"
);

fs.writeFileSync(path.join(here, "_files.json"), JSON.stringify(files, null, 1), "utf8");
console.log("生成 HTML:", files.length, "个");
console.log(files.map((f) => f.png).join(" "));
