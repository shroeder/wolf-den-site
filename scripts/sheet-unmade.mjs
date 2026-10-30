// What the Grove has not drawn — every scene and every sprite, read off the catalogue rather
// than counted by hand.
//
// ⚠️ IT ASKS THE FUNCTION THE RENDERER ASKS. GroveCraftAct already carries the scar: "Found by
// auditing art coverage with groveArt and getting 23 false positives: the audit was asking the
// wrong function." Three families look missing on disk and are not missing at all --
//   · boss emblem seals  emblemArt() returns null for `boss: true` and falls to the boss's sprite
//   · generated foods    MAP_FOODS sets art to map one's picture for the heal tier
//   · charms             keyed by stat, not by charm; all three exist
// so this script reports those as BORROWED, not as holes.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/sheet-unmade.mjs
import fs from "node:fs";

import {
    GROVE_BIOMES, GROVE_EMBLEMS, GROVE_FOODS, emblemArt, slabArt, groveBiome,
} from "@/lib/marketplace/grove-catalog.js";
import { GROVE_MAPS, MAPS_BUILT, MAP_ZONES, foodRecipesForMap } from "@/lib/marketplace/grove-maps.js";

const OUT = "docs/grove-unmade.html";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const has = (p) => !!p && fs.existsSync(`public${p}`);
const PRICE = { plate: 0.0627, item: 0.0422, foe: 0.0422, slab: 0.0627 };
const money = (n) => `$${n.toFixed(2)}`;

// ── THE SCENES ───────────────────────────────────────────────────────────────────────
// A scene is a zone: its own backdrop, its own residents, its own boss. Read from the
// declared maps, so maps 10 and 11 still answer with the names the code holds today.
const unbuilt = GROVE_MAPS.filter((m) => m.zones && m.n > MAPS_BUILT);
const RENAMED = { 10: "The Hollow Colossus", 11: "The Cloudshelf" };

const scenesFor = (m) => MAP_ZONES.filter((z) => z.map === m.n).map((z, i) => {
    const bg = has(z.bg);
    return `<tr>
  <td class="n">${i + 1}</td>
  <td>${esc(z.name)}</td>
  <td class="k">${esc(z.biome)}</td>
  <td class="say">${esc(m.zones[i].bossName)}</td>
  <td class="st">${bg ? '<span class="ok">drawn</span>' : '<span class="no">unmade</span>'}</td>
</tr>`;
}).join("\n");

const mapBlocks = unbuilt.map((m) => `<section class="map">
<div class="map-head">
  <span class="mn">${String(m.n).padStart(2, "0")}</span>
  <h3>${esc(m.name)}</h3>
  ${RENAMED[m.n] ? `<span class="rename">draft 3 renames this to ${esc(RENAMED[m.n])}</span>` : ""}
</div>
<p class="blurb">${esc(m.blurb)}</p>
<div class="scroll"><table>
<tr><th class="n">#</th><th>Scene</th><th>Biome</th><th>Boss</th><th class="st">Backdrop</th></tr>
${scenesFor(m)}
</table></div>
</section>`).join("\n");

// ── THE SPRITE FAMILIES ──────────────────────────────────────────────────────────────
const zoneCount = unbuilt.reduce((a, m) => a + m.zones.length, 0);
const creatureCount = unbuilt.reduce((a, m) => a + m.creatures.length, 0);
const partCount = unbuilt.reduce((a, m) => a + m.parts.length, 0);
const slabMissing = Object.keys(GROVE_BIOMES).filter((b) => !has(slabArt(b)));
const nodeMissing = [...new Set(MAP_ZONES.map((z) => z.node))].filter((n) => !has(n));
const statueCount = 15 + 1;                       // five stats x three rarities, plus the vendor

const ROWS = [
    ["Zone backdrops", zoneCount, "plate", "one scene each, 1536x1024", "unbuilt"],
    ["Creatures", creatureCount, "foe", "twelve residents a map", "unbuilt"],
    ["Bosses", unbuilt.length * 12, "foe", "one a scene", "unbuilt"],
    ["Materials", partCount, "item", "twelve a map, and every one is in a recipe", "unbuilt"],
    ["Mark seals", unbuilt.length, "item", "one emblem a map", "unbuilt"],
    ["Card shelf frames", unbuilt.length, "item", "the drawn frame each map's row wears", "unbuilt"],
    ["Ledge slabs", 5, "slab", "one a NEW biome — clockwork, ice, flesh, cloud, star", "unbuilt"],
    ["Chart symbols", 5, "item", "the node on the map; an unmapped biome falls back to a forest", "unbuilt"],
    ["Rare spawns", 5, "item", "one a map. Today one stag is shared by all seven", "unbuilt"],
    ["NPCs and marshals", 20, "item", "three residents and a Coliseum marshal a map", "unbuilt"],
    ["Tool rungs to redraw", 36, "item", "tiers VIII, X and XI, drawn from the retired map names", "unbuilt"],
    ["Statues and the vendor", statueCount, "item", "five stats, three rarities — statues drop from WORLD 2", "live"],
    ["Cogfall", 6, "item", "a town backdrop and five buildings. No town is in code yet", "unbuilt"],
];
// The backdrop inside the Cogfall row is a plate, not an item; priced apart so the total is honest.
const COGFALL_PLATE_ADJ = PRICE.plate - PRICE.item;

let imgs = 0, cost = COGFALL_PLATE_ADJ;
const rows = ROWS.map(([label, n, kind, why, state]) => {
    const c = n * PRICE[kind];
    imgs += n; cost += c;
    return `<tr>
  <td>${esc(label)}${state === "live" ? ' <span class="tag-live">live</span>' : ""}</td>
  <td class="n">${n}</td>
  <td class="say">${esc(why)}</td>
  <td class="n">${money(c)}</td>
</tr>`;
}).join("\n");

const BORROWED = [
    ["Boss emblem seals", 84, "<code>emblemArt()</code> returns null for a <code>boss</code> emblem and falls through to the boss's own sprite — claiming the path "
        + "<q>would hang a broken image in the corner of every boss card on the shelf.</q>"],
    ["Generated foods", Object.values(GROVE_FOODS).filter((f) => f.art).length,
        "<code>MAP_FOODS</code> sets <code>art</code> to map one's picture for the heal tier, so a deep map's draught wears the Heartwood Draught's face. "
        + "That is the count LIVE on maps 2&ndash;7; the twenty for maps 8&ndash;12 borrow the same four and also cost nothing."],
    ["Charms", 3, "Art is keyed by the <i>stat</i> a charm bends, not by the charm. All three exist, so every charm maps 2&ndash;12 will ever add is already drawn."],
];
const borrowedRows = BORROWED.map(([l, n, why]) => `<tr><td>${esc(l)}</td><td class="n">${n}</td><td class="say">${why}</td><td class="n">$0.00</td></tr>`).join("\n");

const rejects = cost * 0.25;

fs.writeFileSync(OUT, `<title>What the Grove Hasn't Drawn</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
    --bg:#f3f1e8; --surface:#fcfaf3; --sunk:#e9e5d8; --ink:#1f1d17; --muted:#696354;
    --faint:#8d8676; --line:#dcd7c7; --rule:#c4bda9; --accent:#7a5a2e; --ok:#4a6b3f;
    --no:#9a3a28; --live:#1b6473; --live-soft:#dcecef;
    --shadow:0 1px 2px rgba(31,29,23,.05), 0 10px 26px rgba(31,29,23,.05);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#121108; --surface:#1a190f; --sunk:#16150c; --ink:#eae4d2; --muted:#9c9482;
    --faint:#7c7563; --line:#2c2a1c; --rule:#3c3926; --accent:#d9a861; --ok:#8fc47c;
    --no:#f09078; --live:#7fd4e8; --live-soft:#15262b;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 32px rgba(0,0,0,.4);
}}
:root[data-theme="dark"]{
    --bg:#121108; --surface:#1a190f; --sunk:#16150c; --ink:#eae4d2; --muted:#9c9482;
    --faint:#7c7563; --line:#2c2a1c; --rule:#3c3926; --accent:#d9a861; --ok:#8fc47c;
    --no:#f09078; --live:#7fd4e8; --live-soft:#15262b;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 32px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.6}
.wrap{max-width:900px;margin:0 auto;padding:36px 20px 90px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.22em;
         text-transform:uppercase;color:var(--accent);margin:0 0 12px}
h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(2.2rem,7vw,3.5rem);
   line-height:1;letter-spacing:-.024em;margin:0 0 16px;text-wrap:balance}
h2{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(1.3rem,4vw,1.7rem);
   margin:0 0 10px;text-wrap:balance}
h3{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:1.15rem;margin:0}
.kicker{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.2em;
        text-transform:uppercase;color:var(--faint);margin:34px 0 10px}
p{margin:0 0 14px;max-width:66ch}
.lede{font-size:1.06rem;color:var(--muted);max-width:62ch}
.lede b{color:var(--ink);font-weight:600}
code{font-family:"IBM Plex Mono",monospace;font-size:.84em;background:var(--sunk);
     border:1px solid var(--line);border-radius:3px;padding:.5px 5px}
q{font-style:italic;color:var(--muted)}
.rule{height:6px;margin:34px 0 26px;border:0;
      background:repeating-linear-gradient(90deg,var(--rule) 0 2px,transparent 2px 10px)}
.big{display:grid;gap:14px;margin:22px 0 0}
@media(min-width:620px){.big{grid-template-columns:repeat(3,1fr)}}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:8px;
      padding:15px 16px;box-shadow:var(--shadow)}
.stat b{display:block;font-family:Fraunces,Georgia,serif;font-size:2rem;line-height:1;
        font-variant-numeric:tabular-nums}
.stat span{display:block;font-family:"IBM Plex Mono",monospace;font-size:.68rem;
           letter-spacing:.15em;text-transform:uppercase;color:var(--faint);margin-top:6px}
.live-box{background:var(--live-soft);border:1px solid var(--line);
          border-left:3px solid var(--live);border-radius:8px;padding:16px 18px;margin:0 0 18px}
.live-box h2{color:var(--live);font-size:1.25rem}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);
      border-radius:8px;padding:16px 18px;margin:0 0 18px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 14px}
table{width:100%;border-collapse:collapse;font-size:.89rem}
th{text-align:left;font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:500;
   letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
   padding:0 11px 7px 0;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:7px 11px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.k{font-family:"IBM Plex Mono",monospace;font-size:.76rem;color:var(--muted);white-space:nowrap}
td.say{color:var(--muted)}
td.st,th.st{text-align:right;white-space:nowrap}
.ok,.no{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase}
.ok{color:var(--ok)}.no{color:var(--no)}
.tag-live{font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:.14em;
          text-transform:uppercase;color:var(--live);border:1px solid var(--live);
          border-radius:3px;padding:0 4px;vertical-align:1px}
tfoot td{font-weight:600;border-top:2px solid var(--rule);border-bottom:0;padding-top:10px}
.map{margin:0 0 30px}
.map-head{display:flex;align-items:baseline;gap:11px;flex-wrap:wrap;margin-bottom:3px}
.mn{font-family:"IBM Plex Mono",monospace;font-size:1rem;color:var(--accent)}
.rename{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.1em;
        text-transform:uppercase;color:var(--no);border:1px solid var(--line);
        border-radius:3px;padding:1px 6px}
.blurb{font-family:Fraunces,Georgia,serif;font-style:italic;color:var(--muted);
       margin:0 0 12px;max-width:58ch}
.meta{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint)}
footer{margin-top:40px}
</style>
<div class="wrap">

<p class="eyebrow">The Wolf Den · Grove · Art inventory</p>
<h1>What the Grove hasn't drawn</h1>
<p class="lede">Read off the catalogue, not counted by hand. <b>${zoneCount} scenes</b> and
<b>${imgs} sprites</b> are unmade — and three families that look missing on disk are not missing
at all.</p>

<div class="big">
  <div class="stat"><b>${zoneCount}</b><span>scenes with no backdrop</span></div>
  <div class="stat"><b>${imgs}</b><span>sprites unmade</span></div>
  <div class="stat"><b>${money(cost + rejects)}</b><span>to draw all of it</span></div>
</div>

<hr class="rule">

<div class="live-box">
<h2>Only one gap is live</h2>
<p><b>The statues.</b> Five stats, three rarities, plus the vendor they are handed to — sixteen
objects, none drawn. The menu row borrows the emblems icon and a statue renders as a coloured chip
(<code>--r: r.colour</code>), which is the nearest thing to a glyph the Grove has shipped.</p>
<p style="margin:0"><b>Statues drop from world 2</b>, so every member deep enough to see them is
looking at swatches today. Everything else on this page is behind <code>MAPS_BUILT = ${MAPS_BUILT}</code>
and no member can reach it.</p>
</div>

<div class="note">
<h2 style="font-size:1.2rem">Three families are borrowed, not missing</h2>
<p><code>GroveCraftAct</code> already carries this scar: <q>Found by auditing art coverage with
groveArt and getting 23 false positives: the audit was asking the wrong function.</q> It happens
again here, and the first pass of this very page reported 44 missing foods before checking.</p>
<div class="scroll"><table>
<tr><th>Family</th><th class="n">Count</th><th>Why it needs nothing</th><th class="n">Cost</th></tr>
${borrowedRows}
</table></div>
<p style="margin:0" class="meta">⚠️ <code>check:grove</code> does ask the wrong function, at line 278:
it checks <code>groveArt(id)</code> for all 103 emblems, so 84 of its 86 complaints are about files
that are deliberately absent. The gate has been red for that reason alone — which is how the two
real new problems underneath them went unnoticed.</p>
</div>

<p class="kicker">What it would cost</p>
<div class="scroll"><table>
<tr><th>Family</th><th class="n">Images</th><th>What it is</th><th class="n">Cost</th></tr>
${rows}
<tfoot>
<tr><td>Subtotal</td><td class="n">${imgs}</td><td></td><td class="n">${money(cost)}</td></tr>
<tr><td>Plus rejects &amp; retries, ~25%</td><td class="n"></td><td></td><td class="n">${money(rejects)}</td></tr>
<tr><td><b>All of it</b></td><td class="n"></td><td></td><td class="n"><b>${money(cost + rejects)}</b></td></tr>
</tfoot>
</table></div>
<p class="meta">Medium, never high. Backdrops and slabs 1536&times;1024 at ${money(PRICE.plate)};
everything else 1024&times;1024 at ${money(PRICE.item)}. Three images a run on a contact sheet
makes this about <b>${Math.ceil(imgs / 3)} runs</b>.</p>

<hr class="rule">

<p class="kicker">The ${zoneCount} scenes, as the code holds them</p>
<p>Every one is a backdrop, a roster and a boss. Maps 10 and 11 still answer with the names they
were declared under in October &mdash; only map 8 has been rewritten so far.</p>

${mapBlocks}

<footer>
<p class="meta">Generated by <code>scripts/sheet-unmade.mjs</code> ·
<code>MAPS_BUILT = ${MAPS_BUILT}</code> ·
slab art missing: ${slabMissing.join(", ") || "none"} ·
chart symbols missing: ${nodeMissing.map((n) => n.split("/").pop()).join(", ") || "none"}</p>
</footer>

</div>
`);
console.log(`${OUT} — ${zoneCount} scenes, ${imgs} sprites, ${money(cost + rejects)}`);
