// A page of actual pictures: map 8's twelve, beside map 7 drawn in full.
//
// ⚠️ IT REFERENCES FILES, IT DOES NOT INLINE THEM. Sixty sprites as base64 is a 7.5MB page;
// as supporting files the page is 20KB and the images are served beside it. Writes the
// manifest the Artifact `files` parameter wants to artifact-files.json.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/sheet-grove-art.mjs
import fs from "node:fs";

import { GROVE_MAPS, MAP_ZONES, MAPS_BUILT, toolRecipesForMap } from "@/lib/marketplace/grove-maps.js";
import { TOOL_SLOTS } from "@/lib/marketplace/grove-recipes.js";

const OUT = "docs/grove-art.html";
const MANIFEST = "docs/artifact-files.json";
const DIR = "public/images/grove";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const files = {};                                  // published path -> source name under DIR
const ref = (name) => {
    if (!fs.existsSync(`${DIR}/${name}`)) return null;
    files[`img/${name}`] = name;
    return `img/${name}`;
};

// ── MAP 8'S TWELVE ───────────────────────────────────────────────────────────────────
const STEPPE = {
    edge: "Horn Edge", haft: "Lance Shaft", bind: "Horsehair", hide: "Bison Hide",
    ember: "Fulgurite", glow: "Storm Light", stone: "Thunderstone", charm: "The Sky Token",
};
const map8 = GROVE_MAPS.find((m) => m.n === 8);
const authored = new Map(toolRecipesForMap(8).map((r) => [r.slot, r]));
const p8 = (id) => map8.parts.find((p) => p.id === id)?.name || id;

const tools = TOOL_SLOTS.map(({ slot }) => {
    const src = ref(`tool-${slot}-t8.webp`);
    const a = authored.get(slot);
    const was = Object.keys(a.parts).length ? null : null;
    return `<figure class="c">
  ${src ? `<img src="${src}" alt="${esc(a.name)}" loading="lazy" width="512" height="512">`
        : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${esc(slot)}</p><h4>${esc(a.name)}</h4>
  <p class="now">${esc(Object.keys(a.parts).map(p8).join(" · "))}</p></figcaption>
</figure>`;
}).join("\n");

// ── MAP 7, DRAWN ─────────────────────────────────────────────────────────────────────
const m7 = GROVE_MAPS.find((m) => m.n === 7);
const z7 = MAP_ZONES.filter((z) => z.map === 7);

const band = (title, blurb, items, cls) => `<h3>${esc(title)}</h3>
<p class="bl">${blurb}</p>
<div class="g ${cls}">
${items.join("\n")}
</div>`;

const scenes = z7.map((z, i) => {
    const src = ref(`zone-${z.id}.webp`);
    return `<figure class="c wide">
  ${src ? `<img src="${src}" alt="${esc(z.name)}" loading="lazy" width="768" height="512">` : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${i + 1} · ${esc(z.biome)}</p><h4>${esc(z.name)}</h4>
  <p class="now">${esc(m7.zones[i].bossName)}</p></figcaption>
</figure>`;
});

const foes = m7.creatures.map((c) => {
    const src = ref(`foe-${c.id}.webp`);
    return `<figure class="c">
  ${src ? `<img src="${src}" alt="${esc(c.name)}" loading="lazy" width="512" height="512">` : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${esc(c.arch)}</p><h4>${esc(c.name)}</h4>
  <p class="now">${esc(c.blurb)}</p></figcaption>
</figure>`;
});

const bosses = m7.zones.map((z) => {
    const src = ref(`boss-${z.bossId}.webp`);
    return `<figure class="c">
  ${src ? `<img src="${src}" alt="${esc(z.bossName)}" loading="lazy" width="512" height="512">` : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${esc(z.name)}</p><h4>${esc(z.bossName)}</h4></figcaption>
</figure>`;
});

const mats = m7.parts.map((p) => {
    const src = ref(`part-${p.id}.webp`);
    return `<figure class="c">
  ${src ? `<img src="${src}" alt="${esc(p.name)}" loading="lazy" width="512" height="512">` : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${esc(p.role)}</p><h4>${esc(p.name)}</h4>
  <p class="now">${esc(p.blurb)}</p></figcaption>
</figure>`;
});

fs.writeFileSync(OUT, `<title>Grove Art, Drawn and Not</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f3f1e8;--surface:#fcfaf3;--sunk:#e7e3d5;--ink:#1f1d17;--muted:#696354;
      --faint:#8d8676;--line:#dcd7c7;--rule:#c4bda9;--accent:#7a5a2e;--no:#9a3a28;
      --shadow:0 1px 2px rgba(31,29,23,.05),0 8px 22px rgba(31,29,23,.05)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
      --bg:#121108;--surface:#1a190f;--sunk:#15140b;--ink:#eae4d2;--muted:#9c9482;
      --faint:#7c7563;--line:#2c2a1c;--rule:#3c3926;--accent:#d9a861;--no:#f09078;
      --shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px rgba(0,0,0,.4)}}
:root[data-theme="dark"]{--bg:#121108;--surface:#1a190f;--sunk:#15140b;--ink:#eae4d2;
      --muted:#9c9482;--faint:#7c7563;--line:#2c2a1c;--rule:#3c3926;--accent:#d9a861;
      --no:#f09078;--shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px rgba(0,0,0,.4)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto;padding:34px 20px 90px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.22em;
         text-transform:uppercase;color:var(--accent);margin:0 0 12px}
h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(2.2rem,7vw,3.4rem);
   line-height:1.02;letter-spacing:-.024em;margin:0 0 14px;text-wrap:balance}
h2{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(1.5rem,4.4vw,2rem);
   margin:0 0 6px;text-wrap:balance}
h3{font-family:"IBM Plex Mono",monospace;font-size:.72rem;font-weight:500;letter-spacing:.2em;
   text-transform:uppercase;color:var(--faint);margin:30px 0 4px}
h4{font-family:Fraunces,Georgia,serif;font-size:1rem;font-weight:700;margin:0 0 4px;line-height:1.2}
p{margin:0 0 13px;max-width:66ch}
.lede{font-size:1.05rem;color:var(--muted);max-width:60ch}
.lede b{color:var(--ink);font-weight:600}
.bl{color:var(--muted);font-size:.9rem;margin:0 0 14px;max-width:70ch}
code{font-family:"IBM Plex Mono",monospace;font-size:.84em;background:var(--sunk);
     border:1px solid var(--line);border-radius:3px;padding:.5px 5px}
.rule{height:6px;margin:36px 0 28px;border:0;
      background:repeating-linear-gradient(90deg,var(--rule) 0 2px,transparent 2px 10px)}
.warn{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--no);
      border-radius:8px;padding:15px 17px;margin:0 0 22px}
.warn p:last-child{margin:0}
.g{display:grid;gap:13px;grid-template-columns:repeat(auto-fill,minmax(168px,1fr))}
.g.scenes{grid-template-columns:repeat(auto-fill,minmax(268px,1fr))}
.c{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;
   overflow:hidden;box-shadow:var(--shadow)}
.c img{display:block;width:100%;height:auto;background:var(--sunk)}
.hole{aspect-ratio:1;display:grid;place-items:center;background:var(--sunk);
      font-family:"IBM Plex Mono",monospace;font-size:.72rem;color:var(--no);
      text-transform:uppercase;letter-spacing:.1em}
figcaption{padding:10px 12px 12px}
.sl{font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.15em;
    text-transform:uppercase;color:var(--faint);margin:0 0 2px}
.now{font-size:.78rem;color:var(--muted);margin:0;line-height:1.4}
.meta{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint)}
footer{margin-top:40px}
</style>
<div class="wrap">

<p class="eyebrow">The Wolf Den · Grove · Art</p>
<h1>Actual sprites</h1>
<p class="lede">You asked twice and I kept sending tables. Here are the pictures:
<b>map 8's twelve</b>, and then <b>map 7 drawn in full</b> &mdash; 48 sprites, which is exactly
what map 8 would be if it were drawn.</p>

<hr class="rule">

<h2>Map 8 has twelve pictures</h2>
<p>That is all of it. Every one is a tool rung at tier VIII.</p>
<div class="warn">
<p>⚠️ <b>All twelve were drawn from The Thunder Steppe</b> &mdash; horn, hide, horsehair and
lightning-glass. Map 8 is now The Clockwork Deep, made of brass, chain, felt and lead.</p>
<p>Nothing broke, which is the problem: tool art is keyed
<code>tool-&lt;slot&gt;-t&lt;tier&gt;.webp</code> with no map in the filename, so all twelve still
resolve. The line under each picture is what its recipe asks for <i>now</i>. Compare it to the
picture.</p>
</div>
<div class="g">
${tools}
</div>

<hr class="rule">

<h2>Map 7, drawn</h2>
<p>The Ashen Reach is the last map that got its art. This is the whole shape of a finished map, and
map 8 needs all 48 of it: twelve scenes, twelve residents, twelve bosses, twelve materials.</p>

${band("The twelve scenes", "Each one is a backdrop at 1536&times;1024, its own roster and its own boss. Map 8's twelve scenes are named, costed and blank.", scenes, "scenes")}
${band("The twelve residents", "One creature per scene. Map 8's twelve are written &mdash; Tick Mite, Piston Hound, Arc Coil, Gauge Watcher &mdash; and none are drawn.", foes, "")}
${band("The twelve bosses", "One per scene, back up every thirty minutes.", bosses, "")}
${band("The twelve materials", "Every one is in at least one recipe. Map 8's twelve now feed seventeen authored craftables.", mats, "")}

<footer>
<hr class="rule">
<p class="meta">Generated by <code>scripts/sheet-grove-art.mjs</code> ·
${Object.keys(files).length} sprites, served as files rather than inlined ·
<code>MAPS_BUILT = ${MAPS_BUILT}</code></p>
</footer>

</div>
`);

fs.writeFileSync(MANIFEST, JSON.stringify(files, null, 1));
console.log(`${OUT} — ${Object.keys(files).length} sprites referenced`);
console.log(`${MANIFEST} — manifest for the Artifact files parameter`);
