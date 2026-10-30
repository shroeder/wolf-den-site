// Contact sheet: every sprite that exists for map 8 today.
//
// That is exactly twelve pictures -- the tier-VIII tool rungs, drawn in October from The Thunder
// Steppe's materials. Renaming map 8 to The Clockwork Deep does not break them loudly: tool art is
// keyed `tool-<slot>-t<tier>.webp`, with no map in the filename, so all twelve keep resolving and
// keep showing a pickaxe of horn edge, lance shaft and bison hide on a map made of brass.
//
// So this sheet is the before-shot for one decision: redraw twelve, or keep the old names.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/sheet-map8-tools.mjs
import fs from "node:fs";

import { TOOL_SLOTS } from "@/lib/marketplace/grove-recipes.js";
import { TOOL_ROLES, groveMap, toolRecipesForMap } from "@/lib/marketplace/grove-maps.js";

const OUT = "docs/map8-tool-sprites.html";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// What the twelve were ACTUALLY drawn from: The Thunder Steppe's first material per role, which is
// what gen-grove-art.mjs fed the prompt. Kept here as data because the map it came from is gone.
const STEPPE = {
    edge: "Horn Edge", haft: "Lance Shaft", bind: "Horsehair", hide: "Bison Hide",
    ember: "Fulgurite", glow: "Storm Light", stone: "Thunderstone", charm: "The Sky Token",
};

const map8 = groveMap(8);
const partName = (id) => map8.parts.find((p) => p.id === id)?.name || id;
const authored = new Map(toolRecipesForMap(8).map((r) => [r.slot, r]));

const uri = (slot) => {
    const f = `public/images/grove/tool-${slot}-t8.webp`;
    if (!fs.existsSync(f)) return null;
    return `data:image/webp;base64,${fs.readFileSync(f).toString("base64")}`;
};

let drawn = 0;
const cards = TOOL_SLOTS.map(({ slot, name }) => {
    const src = uri(slot);
    if (src) drawn += 1;
    const was = TOOL_ROLES[slot].map((r) => STEPPE[r]).join(" · ");
    const a = authored.get(slot);
    const now = Object.keys(a.parts).map(partName).join(" · ");
    return `<figure class="card">
  <div class="shot">${src ? `<img src="${src}" alt="${esc(name)}, tier VIII" loading="lazy">`
        : `<p class="missing">not drawn</p>`}</div>
  <figcaption>
    <p class="slot">${esc(slot)}</p>
    <h3>${esc(a.name)}</h3>
    <p class="was"><span>drawn from</span>${esc(was)}</p>
    <p class="now"><span>recipe now asks</span>${esc(now)}</p>
  </figcaption>
</figure>`;
}).join("\n");

fs.writeFileSync(OUT, `<title>Map 8 Tool Sprites</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {
    --bg:#f2efe6; --surface:#fbf8f0; --sunk:#e8e3d5; --ink:#211d16; --muted:#6b6454;
    --faint:#8d8574; --line:#dcd6c5; --rule:#c5bda7; --brass:#8a6412; --warn:#9a3a28;
    --shadow:0 1px 2px rgba(33,29,22,.06), 0 10px 28px rgba(33,29,22,.06);
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg:#131209; --surface:#1b1a10; --sunk:#17160d; --ink:#ece5d3; --muted:#9d9583;
    --faint:#7e7764; --line:#2d2b1d; --rule:#3d3a27; --brass:#e0a83c; --warn:#f0907a;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 32px rgba(0,0,0,.4);
} }
:root[data-theme="dark"] {
    --bg:#131209; --surface:#1b1a10; --sunk:#17160d; --ink:#ece5d3; --muted:#9d9583;
    --faint:#7e7764; --line:#2d2b1d; --rule:#3d3a27; --brass:#e0a83c; --warn:#f0907a;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 32px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.6}
.wrap{max-width:1100px;margin:0 auto;padding:36px 20px 80px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.22em;
         text-transform:uppercase;color:var(--brass);margin:0 0 12px}
h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(2.1rem,6vw,3.2rem);
   line-height:1.02;letter-spacing:-.022em;margin:0 0 14px;text-wrap:balance}
.lede{color:var(--muted);max-width:62ch;margin:0 0 6px}
.lede b{color:var(--ink);font-weight:600}
.teeth{height:7px;margin:26px 0 30px;
       background:repeating-linear-gradient(90deg,var(--rule) 0 2px,transparent 2px 11px)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;
      overflow:hidden;box-shadow:var(--shadow)}
.shot{background:var(--sunk);aspect-ratio:1;display:grid;place-items:center;
      border-bottom:1px solid var(--line)}
.shot img{width:100%;height:100%;object-fit:contain;display:block}
.missing{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint);margin:0}
figcaption{padding:12px 14px 14px}
.slot{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.16em;
      text-transform:uppercase;color:var(--faint);margin:0 0 2px}
figcaption h3{font-family:Fraunces,Georgia,serif;font-size:1.06rem;font-weight:700;margin:0 0 9px}
.was,.now{font-size:.8rem;margin:0 0 5px;line-height:1.45}
.was{color:var(--warn)}
.now{color:var(--muted)}
.was span,.now span{display:block;font-family:"IBM Plex Mono",monospace;font-size:.62rem;
                    letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--brass);
      border-radius:8px;padding:15px 17px;margin:0 0 4px;max-width:70ch}
.note p{margin:0 0 10px}.note p:last-child{margin:0}
footer{margin-top:34px}
.meta{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint)}
</style>
<div class="wrap">
<p class="eyebrow">The Wolf Den · Grove · Map 8</p>
<h1>Every sprite map 8 has</h1>
<p class="lede">This is all of it: <b>${drawn} of 12 tool rungs</b>. No zone backdrop, no creature, no
boss, no part and no emblem for map 8 has ever been drawn.</p>
<div class="note">
<p>⚠️ <b>All twelve were drawn from The Thunder Steppe</b>, in October, before the map was renamed.
Tool art is keyed <code>tool-&lt;slot&gt;-t&lt;tier&gt;.webp</code> with no map in the filename, so
every one still resolves and still shows horn, hide and lightning-glass on a map now made of brass,
chain and lead.</p>
<p>Nothing errors. Nothing 404s. The red line on each card is what the picture is actually of; the
grey line under it is what the recipe asks for today.</p>
</div>
<div class="teeth"></div>
<div class="grid">
${cards}
</div>
<footer><p class="meta">Generated by <code>scripts/sheet-map8-tools.mjs</code> ·
sprites inlined · ${drawn} of 12 present</p></footer>
</div>
`);
console.log(`${OUT} — ${drawn} of 12 sprites inlined`);
