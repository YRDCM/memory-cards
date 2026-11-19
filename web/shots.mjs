import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

const html = read("../dist/index.html");

/* ---- 从 deck1 生成一份看起来真实的进度数据 ---- */
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
  const t = (((k % 11) / 10) * i * 2.2);
  const overdue = k % 5 === 0 || k % 7 === 0;
  prog[id] = {
    e: 2.4,
    i,
    r: 1 + (k % 6),
    due: now + (overdue ? -(0.4 + (k % 3)) * DAY : i * 0.6 * DAY),
    lapses: k % 9 === 0 ? 1 : 0,
    born: now - 45 * DAY,
    seen: now - t * DAY,
  };
});

const ymd = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const daily = {};
const gaps = new Set([8, 9, 17, 26, 38]);
for (let i = 44; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  if (gaps.has(i)) continue;
  const cards = i === 0 ? 12 : 18 + ((i * 7) % 22);
  daily[ymd(d)] = {
    cards,
    sec: cards * 55,
    newW: i === 0 ? 8 : 20,
    reviews: Math.max(0, cards - 20),
    correct: Math.round(cards * 0.79),
  };
}

const state = {
  v: 1,
  prog,
  custom: [],
  daily,
  set: { dailyNew: 20, targetMin: 25, reminder: "20:30", spelling: false, rate: 0.9, deck: "all" },
  meta: { created: "2026-10-06", lastActive: ymd(new Date()), bestStreak: 19 },
  timer: { left: 18 * 60 + 24, mode: "focus" },
};

const seed =
  "<script>try{localStorage.setItem('eyc_v1'," +
  JSON.stringify(JSON.stringify(state)) +
  ")}catch(e){}</script>";

const spellState = JSON.parse(JSON.stringify(state));
spellState.set.spelling = true;
spellState.set.dailyNew = 0;
const seedSpell =
  "<script>try{localStorage.setItem('eyc_v1'," +
  JSON.stringify(JSON.stringify(spellState)) +
  ")}catch(e){}</script>";

const variants = {
  today: "",
  first: "",
  study: `document.querySelector('[data-act=start]').click();
    setTimeout(function(){var b=document.querySelector('[data-act=flip]');if(b)b.click();},250);`,
  "study-front": `document.querySelector('[data-act=start]').click();`,
  words: `document.querySelector('[data-act=go][data-view=words]').click();`,
  stats: `document.querySelector('[data-act=go][data-view=stats]').click();`,
  settings: `document.querySelector('[data-act=go][data-view=settings]').click();`,
  spell: `document.querySelector('[data-act=start]').click();`,
  flow: `
    var out = [];
    function log(k, v) { out.push(k + "=" + v); }
    try {
      document.querySelector('[data-act=start]').click();
      var first = document.querySelector('.fc-word').textContent;
      document.querySelector('[data-act=flip]').click();
      log('gradeBtns', document.querySelectorAll('[data-act=grade]').length);
      document.querySelector('[data-g="3"]').click();
      document.querySelector('[data-act=flip]').click();
      document.querySelector('[data-g="1"]').click();
      log('first', first);
      log('now', document.querySelector('.fc-word') ? document.querySelector('.fc-word').textContent : "none");
      log('progress', document.querySelector('.study-top span').textContent);
    } catch (err) {
      log("EXCEPTION", err.message);
    }
    setTimeout(function () {
      try {
        var st = JSON.parse(localStorage.getItem('eyc_v1'));
        var keys = Object.keys(st.daily).sort();
        var d = st.daily[keys[keys.length - 1]];
        log('cards', d.cards);
        log('newW', d.newW);
        log('reviews', d.reviews);
        log('progCount', Object.keys(st.prog).length);
        var okNew = st.prog["world"];
        log('worldSRS', okNew ? "i=" + okNew.i.toFixed(3) + " r=" + okNew.r : "missing");
        log('title', document.title);
      } catch (err) {
        log("EX2", err.message);
      }
      var dv = document.createElement("div");
      dv.id = "errlog";
      dv.textContent = out.join(" | ");
      document.body.appendChild(dv);
    }, 600);`,
};

const noSeed = new Set(["first"]);
const spellSeed = new Set(["spell"]);

let n = 0;
for (const [name, act] of Object.entries(variants)) {
  const tail = `<script>setTimeout(function(){${act}},80);</script>`;
  let out = noSeed.has(name)
    ? html.replace("<body>", "<body>\n<script>try{localStorage.clear()}catch(e){}</script>")
    : html.replace("<body>", "<body>\n" + (spellSeed.has(name) ? seedSpell : seed));
  out = out.replace("</body>", tail + "\n</body>");
  fs.writeFileSync(path.join(here, "_t-" + name + ".html"), out, "utf8");
  n++;
}
console.log("variants:", n);
