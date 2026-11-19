import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

const html = read("../dist/index.html");
const CODE = ("sync" + crypto.randomBytes(12).toString("hex")).slice(0, 26);

/* 用 deck1 造一份「设备 A 已经背了 96 个词」的状态 */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read("deck1.js") + "\nglobalThis.D=DECK1;", ctx);
const ids = ctx.D.map((w) => String(w[0]).toLowerCase());

const DAY = 86400000;
const now = Date.now();
const tiers = [0.4, 0.8, 1.5, 2.5, 4, 7, 11, 18, 28, 45];
const prog = {};
ids.forEach((id, k) => {
  if (k >= 96) return;
  const i = +(tiers[k % tiers.length] * (0.75 + ((k * 37) % 50) / 100)).toFixed(2);
  prog[id] = {
    e: 2.4,
    i,
    r: 1 + (k % 6),
    due: now + (k % 5 === 0 ? -2 * DAY : i * 0.6 * DAY),
    lapses: 0,
    born: now - 45 * DAY,
    seen: now - (k % 11) * i * 0.2 * DAY,
  };
});

const ymd = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const daily = {};
for (let i = 10; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  daily[ymd(d)] = { cards: 20 + i, sec: 1200, newW: 20, reviews: i, correct: 16 };
}

const baseSet = {
  dailyNew: 20,
  targetMin: 25,
  reminder: "20:30",
  spelling: false,
  rate: 0.9,
  deck: "all",
  syncCode: CODE,
  syncOn: true,
};
const meta = { created: "2026-10-06", lastActive: ymd(new Date()), bestStreak: 12 };

const stateA = {
  v: 1,
  prog,
  custom: [],
  daily,
  set: baseSet,
  meta,
  timer: { left: 1500, mode: "focus" },
  sync: { rev: 0, at: 0, err: false },
};

/* 设备 B：只背过 12 个词，其余是空的 */
const progB = {};
Object.keys(prog)
  .slice(0, 12)
  .forEach((k) => (progB[k] = prog[k]));
const stateB = {
  v: 1,
  prog: progB,
  custom: [],
  daily: {},
  set: baseSet,
  meta: { created: ymd(new Date()), lastActive: ymd(new Date()), bestStreak: 0 },
  timer: { left: 1500, mode: "focus" },
  sync: { rev: 0, at: 0, err: false },
};

function variant(name, state) {
  const seed =
    "<script>try{localStorage.setItem('eyc_v1'," +
    JSON.stringify(JSON.stringify(state)) +
    ")}catch(e){}</script>";
  let out = html.replace("<body>", "<body>\n" + seed);
  out = out.replace(
    "</body>",
    `<script>setTimeout(function(){
       var d=document.createElement("div");d.id="probe";
       d.textContent="prog="+Object.keys(JSON.parse(localStorage.getItem("eyc_v1")).prog).length;
       document.body.appendChild(d);
     },4000);</script>\n</body>`
  );
  fs.writeFileSync(path.join(here, "_s-" + name + ".html"), out, "utf8");
}

variant("a", stateA);
variant("b", stateB);
fs.writeFileSync(path.join(here, "_s-code.txt"), CODE, "utf8");
console.log("sync code:", CODE);
console.log("A prog:", Object.keys(prog).length, " B prog:", Object.keys(progB).length);
