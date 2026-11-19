import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

const shell = read("shell.html");
const css = read("style.css");
const parts = ["deck1.js", "deck2.js", "deck3.js", "app.js"]
  .filter((f) => fs.existsSync(path.join(here, f)))
  .map(read)
  .join("\n\n");

/* 图标内联成 data URI，保证单文件也能带上 favicon */
let favicon = "";
let appleIcon = "";
const svgPath = path.join(here, "icon.svg");
const pngPath = path.join(here, "icon-touch.png");
if (fs.existsSync(svgPath)) {
  const svg = fs
    .readFileSync(svgPath, "utf8")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  favicon = "data:image/svg+xml," + encodeURIComponent(svg);
}
if (fs.existsSync(pngPath)) {
  appleIcon = "data:image/png;base64," + fs.readFileSync(pngPath).toString("base64");
}

const stamp = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes())
  );
})();

const out = shell
  .replace("/*__CSS__*/", () => css)
  .replace("/*__JS__*/", () => parts)
  .replace("__FAVICON__", () => favicon || "data:,")
  .replace("__APPLE_ICON__", () => appleIcon || "data:,")
  .replace(/__BUILD__/g, () => stamp);

const dest = path.join(here, "..", "dist", "index.html");
fs.writeFileSync(dest, out, "utf8");
console.log("built ->", dest, (out.length / 1024).toFixed(1) + " KB");
