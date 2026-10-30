// Act VIII — Cogfall, shown in the vocabulary the towns are actually built in.
//
// ⚠️ WRITTEN AFTER FINDING THE COGFALL DOC WAS WRONG. docs/grove-town-8-cogfall.html says "No town
// is in code yet", on the authority of docs/grove-towns-design.md ("Nothing is in code yet", written
// 2026-10-28). Both are stale: TOWNS holds seven live towns, acts.js holds Acts I-VII with quests
// and tool-slot perks, TownClient.js renders a parallax street, and 57 town sprites are on disk.
// So town 8 is not a design question any more -- it is a row in a table and seven missing files.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/sheet-town8.mjs
import fs from "node:fs";

import { TOWNS, GATING_LIVE } from "@/lib/marketplace/towns.js";
import { ACTS } from "@/lib/marketplace/acts.js";

const OUT = "docs/town-8-cogfall-art.html";
const MANIFEST = "docs/town8-files.json";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const files = {};
const ref = (rel) => {
    const src = `public/images/town/${rel}`;
    if (!fs.existsSync(src)) return null;
    files[`img/${rel.replace("/", "-")}`] = rel;
    return `img/${rel.replace("/", "-")}`;
};

// ── THE SEVEN STREETS ────────────────────────────────────────────────────────────────
const streets = TOWNS.map((t) => {
    const src = ref(`ground/${t.id}.webp`);
    const act = ACTS.find((a) => a.town === t.id);
    return `<figure class="shot">
  ${src ? `<img src="${src}" alt="${esc(t.name)}" loading="lazy">` : '<div class="hole">unmade</div>'}
  <figcaption>
    <p class="sl">Act ${"I".repeat(0) || t.n} &middot; ${esc(t.id)}</p>
    <h4>${esc(t.name)}</h4>
    <p class="now">${esc(t.blurb)} Opens onto ${esc(t.opens)}.</p>
    <p class="feat">${t.features.map((f) => `<span>${esc(f)}</span>`).join("")}</p>
    <p class="now q">${act ? `${act.quests.length} quests` : "no act"}</p>
  </figcaption>
</figure>`;
}).join("\n");

// ── THE LAYER STACK, with Ashfall's real three ───────────────────────────────────────
const layers = [
    ["ground/ashfall-sky.webp", "sky", "Tiles horizontally and parallaxes slowest. Top 66% of the scene."],
    ["ground/ashfall.webp", "street", "The cobble band the buildings stand on. Bases sit at 72% from the top."],
    ["ground/ashfall-fg.webp", "foreground", "A wall repeated left to right, every other copy mirrored. Avatars walk in front of it."],
].map(([rel, name, why]) => {
    const src = ref(rel);
    return `<figure class="shot wide">
  ${src ? `<img src="${src}" alt="${esc(name)}" loading="lazy">` : '<div class="hole">unmade</div>'}
  <figcaption><p class="sl">${esc(rel.split("/")[1])}</p><h4>${esc(name)}</h4>
  <p class="now">${esc(why)}</p></figcaption>
</figure>`;
}).join("\n");

// ── EVERY BUILDING IN THE GAME ───────────────────────────────────────────────────────
const pieceFiles = fs.readdirSync("public/images/town/piece").filter((f) => f.endsWith(".webp")).sort();
const byTown = {};
for (const f of pieceFiles) {
    const [town, ...rest] = f.replace(".webp", "").split("_");
    (byTown[town] ||= []).push([f, rest.join(" ")]);
}
const order = TOWNS.map((t) => t.id).filter((id) => byTown[id]);
const pieces = order.map((id) => {
    const t = TOWNS.find((x) => x.id === id);
    const cards = byTown[id].map(([f, label]) => {
        const src = ref(`piece/${f}`);
        return `<figure class="pc">
  ${src ? `<img src="${src}" alt="${esc(label)}" loading="lazy">` : '<div class="hole">unmade</div>'}
  <figcaption><h4>${esc(label)}</h4></figcaption>
</figure>`;
    }).join("\n");
    return `<h4 class="tn">Act ${t.n} &middot; ${esc(t.name)} <span>${byTown[id].length} buildings</span></h4>
<div class="g pcs">${cards}</div>`;
}).join("\n");

// ── WHAT COGFALL NEEDS ──────────────────────────────────────────────────────────────
const NEED = [
    ["ground/cogwork-sky.webp", "sky", 0.0627, "A machine ceiling, not weather. Brass ductwork and dark iron going up out of sight, lit from vents. Tiles horizontally."],
    ["ground/cogwork.webp", "street", 0.0627, "The gear's rim as the road: milled brass tread-plate, flush rivets, oil-black in the seams. Tiles."],
    ["ground/cogwork-fg.webp", "foreground", 0.0627, "A run of gear teeth, man-height, repeated and mirrored. The thing the town is built inside."],
    ["piece/cogwork_centerpiece.webp", "centerpiece", 0.0422, "The stopped gear itself, seen end-on, a third of its teeth above the floor. Every town has one."],
    ["piece/cogwork_questgiver.webp", "questgiver", 0.0422, "Keeper Sprocket's post. Every town has one."],
    ["piece/cogwork_vault.webp", "vault", 0.0422, "Every town has one."],
    ["piece/cogwork_statues.webp", "statue vendor", 0.0422, "⚠️ THE ONE BUILDING THAT IS NOT IN ANY OTHER TOWN, and the reason to arrive: world 8 is the vendor's second tier, where crystal statues start dropping."],
];
const needImgs = NEED.length;
const needCost = NEED.reduce((a, [, , c]) => a + c, 0);
const needRows = NEED.map(([f, what, c, why]) => `<tr>
  <td class="k">${esc(f)}</td><td>${esc(what)}</td><td class="say">${why}</td><td class="num">$${c.toFixed(2)}</td>
</tr>`).join("\n");

fs.writeFileSync(OUT, `<title>Act VIII, Cogfall</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f2efe6;--surface:#fbf8f0;--sunk:#e7e3d5;--ink:#1f1d17;--muted:#6a6454;
      --faint:#8c8575;--line:#dbd6c6;--rule:#c3bca8;--brass:#8a6412;--dial:#15616f;
      --dial-soft:#dcecef;--no:#9a3a28;
      --shadow:0 1px 2px rgba(31,29,23,.05),0 9px 24px rgba(31,29,23,.06)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
      --bg:#121108;--surface:#1a190f;--sunk:#15140b;--ink:#eae4d2;--muted:#9b9381;
      --faint:#7b7462;--line:#2b291b;--rule:#3b3825;--brass:#e0a83c;--dial:#7fd4e8;
      --dial-soft:#15262b;--no:#f09078;
      --shadow:0 1px 2px rgba(0,0,0,.5),0 11px 30px rgba(0,0,0,.42)}}
:root[data-theme="dark"]{--bg:#121108;--surface:#1a190f;--sunk:#15140b;--ink:#eae4d2;
      --muted:#9b9381;--faint:#7b7462;--line:#2b291b;--rule:#3b3825;--brass:#e0a83c;
      --dial:#7fd4e8;--dial-soft:#15262b;--no:#f09078;
      --shadow:0 1px 2px rgba(0,0,0,.5),0 11px 30px rgba(0,0,0,.42)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.6}
.wrap{max-width:1140px;margin:0 auto;padding:34px 20px 90px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.22em;
         text-transform:uppercase;color:var(--brass);margin:0 0 12px}
h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(2.3rem,7.5vw,3.6rem);
   line-height:1;letter-spacing:-.025em;margin:0 0 14px;text-wrap:balance}
h2{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(1.5rem,4.4vw,2rem);
   margin:0 0 8px;text-wrap:balance}
h3{font-family:"IBM Plex Mono",monospace;font-size:.72rem;font-weight:500;letter-spacing:.2em;
   text-transform:uppercase;color:var(--faint);margin:34px 0 10px}
h4{font-family:Fraunces,Georgia,serif;font-size:1rem;font-weight:700;margin:0 0 3px;line-height:1.2}
h4.tn{font-size:1.05rem;margin:24px 0 10px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h4.tn span{font-family:"IBM Plex Mono",monospace;font-size:.66rem;letter-spacing:.14em;
            text-transform:uppercase;color:var(--faint);font-weight:400}
p{margin:0 0 13px;max-width:66ch}
.lede{font-size:1.05rem;color:var(--muted);max-width:62ch}
.lede b{color:var(--ink);font-weight:600}
code{font-family:"IBM Plex Mono",monospace;font-size:.84em;background:var(--sunk);
     border:1px solid var(--line);border-radius:3px;padding:.5px 5px}
.rule{height:6px;margin:36px 0 26px;border:0;
      background:repeating-linear-gradient(90deg,var(--rule) 0 2px,transparent 2px 10px)}
.warn{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--no);
      border-radius:8px;padding:15px 17px;margin:0 0 20px}
.warn p:last-child{margin:0}
.find{background:var(--dial-soft);border:1px solid var(--line);border-left:3px solid var(--dial);
      border-radius:8px;padding:15px 17px;margin:0 0 20px}
.find h2{color:var(--dial);font-size:1.25rem}
.find p:last-child{margin:0}
.g{display:grid;gap:14px}
.streets{grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
.stack{grid-template-columns:1fr}
.pcs{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:11px}
.shot,.pc{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;
          overflow:hidden;box-shadow:var(--shadow)}
.shot img,.pc img{display:block;width:100%;height:auto;background:var(--sunk)}
.pc img{padding:6px}
.hole{aspect-ratio:16/7;display:grid;place-items:center;background:var(--sunk);
      font-family:"IBM Plex Mono",monospace;font-size:.72rem;color:var(--no);
      text-transform:uppercase;letter-spacing:.1em}
figcaption{padding:11px 13px 13px}
.pc figcaption{padding:7px 9px 9px;text-align:center}
.pc h4{font-size:.78rem;font-family:"IBM Plex Sans",sans-serif;font-weight:500;
       color:var(--muted);text-transform:capitalize}
.sl{font-family:"IBM Plex Mono",monospace;font-size:.63rem;letter-spacing:.15em;
    text-transform:uppercase;color:var(--faint);margin:0 0 2px}
.now{font-size:.82rem;color:var(--muted);margin:0 0 7px;line-height:1.45}
.now.q{font-family:"IBM Plex Mono",monospace;font-size:.68rem;margin:0}
.feat{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 7px}
.feat span{font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:.08em;
           color:var(--brass);border:1px solid var(--line);border-radius:3px;padding:0 4px}
table{width:100%;border-collapse:collapse;font-size:.88rem}
.scroll{overflow-x:auto;margin:0 0 14px}
th{text-align:left;font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:500;
   letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
   padding:0 11px 7px 0;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:8px 11px 8px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.k{font-family:"IBM Plex Mono",monospace;font-size:.76rem;color:var(--muted);white-space:nowrap}
td.say{color:var(--muted)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{font-weight:600;border-top:2px solid var(--rule);border-bottom:0;padding-top:10px}
figure svg{display:block;width:100%;height:auto}
figcaption.cap{padding:10px 0 0;font-size:.82rem;color:var(--muted);max-width:66ch}
.meta{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint)}
footer{margin-top:40px}
</style>
<div class="wrap">

<p class="eyebrow">The Wolf Den &middot; Act VIII</p>
<h1>Cogfall</h1>
<p class="lede">You asked to see town 8 in all its glory. Here is the glory it would be built from:
<b>the seven towns that exist</b>, drawn, live, and rendering today &mdash; and then the
<b>seven files</b> Cogfall is missing.</p>

<div class="warn">
<h2 style="font-size:1.2rem">⚠️ First, a correction to my own Cogfall doc</h2>
<p>It says <q>No town is in code yet</q> and gives Cogfall five invented buildings. Both wrong. I
took that from <code>docs/grove-towns-design.md</code>, which opens <q>Nothing is in code yet</q> and
was written two days ago.</p>
<p style="margin:0">The truth: <code>TOWNS</code> holds <b>seven live towns</b>,
<code>acts.js</code> holds <b>Acts I&ndash;VII</b> with quests and tool-slot perks,
<code>TownClient.js</code> renders a parallax street, and <b>57 town sprites are on disk</b>. Town 8
is not a design question any more. It is a row in a table and seven missing files.
<code>GATING_LIVE</code> is <code>${String(GATING_LIVE)}</code>, so all of it is live and inert.</p>
</div>

<hr class="rule">

<h2>What a Wolf Den town is</h2>
<p>Three tiling layers and a set of cutout buildings. Nothing about Cogfall needs inventing &mdash;
it needs the same three plates and four pieces every other act has.</p>

<figure>
<svg viewBox="0 0 680 230" role="img" aria-label="A town scene is three tiling layers with building cutouts standing at 72 percent from the top, and avatars walking in front of the foreground wall">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="40" y="18" width="600" height="86" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
  <text x="48" y="36" font-size="12" fill="currentColor" opacity=".75">sky &mdash; tiles, parallaxes slowest</text>
  <rect x="40" y="104" width="600" height="56" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
  <text x="48" y="122" font-size="12" fill="currentColor" opacity=".75">street &mdash; tiles</text>
  <line x1="40" y1="122" x2="640" y2="122" stroke="#8a6412" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="560" y="117" font-size="11" fill="#8a6412" text-anchor="end">base line, 72%</text>
  <rect x="110" y="78" width="74" height="44" fill="currentColor" opacity=".16"/>
  <text x="147" y="104" font-size="11" fill="currentColor" text-anchor="middle">centrepiece</text>
  <rect x="236" y="88" width="62" height="34" fill="currentColor" opacity=".16"/>
  <text x="267" y="109" font-size="11" fill="currentColor" text-anchor="middle">vault</text>
  <rect x="350" y="86" width="62" height="36" fill="currentColor" opacity=".16"/>
  <text x="381" y="109" font-size="11" fill="currentColor" text-anchor="middle">quests</text>
  <rect x="464" y="80" width="70" height="42" fill="#15616f" opacity=".2"/>
  <text x="499" y="105" font-size="11" fill="#15616f" text-anchor="middle">statues</text>
  <rect x="40" y="160" width="600" height="40" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
  <text x="48" y="178" font-size="12" fill="currentColor" opacity=".75">foreground &mdash; repeated, every other copy mirrored</text>
  <circle cx="300" cy="186" r="9" fill="currentColor" opacity=".3"/>
  <text x="318" y="190" font-size="11" fill="currentColor" opacity=".75">avatars walk here, in front</text>
  <line x1="652" y1="18" x2="652" y2="200" stroke="currentColor" stroke-width="1" opacity=".4" marker-end="url(#a)"/>
  <text x="664" y="112" font-size="11" fill="currentColor" opacity=".6" transform="rotate(90 664 112)" text-anchor="middle">z order</text>
</svg>
<figcaption class="cap">The stack <code>TownClient</code> composites. Only the statue vendor is new
&mdash; every other act has a centrepiece, a vault and a questgiver in the same three slots.</figcaption>
</figure>

<h3>Ashfall's three layers, as they really are</h3>
<div class="g stack">
${layers}
</div>

<hr class="rule">

<h2>The seven streets</h2>
<p>Every one of these is live art rendering in the game right now. Cogfall is the eighth.</p>
<div class="g streets">
${streets}
</div>

<hr class="rule">

<h2>Every building in the game</h2>
<p>${pieceFiles.length} cutouts. Note the pattern: each act has a <b>centrepiece</b>, a
<b>vault</b> and a <b>questgiver</b>, then one building per feature it unlocks. Act 8 unlocks no
features, so it gets the three &mdash; plus the one building no other town has.</p>
${pieces}

<hr class="rule">

<div class="find">
<h2>What Cogfall is missing</h2>
<p style="margin:0">Seven files. Three plates and four pieces, named to match every other act, at
<b>$${needCost.toFixed(2)}</b>.</p>
</div>

<div class="scroll"><table>
<tr><th>File</th><th>Slot</th><th>What it is</th><th class="num">Cost</th></tr>
${needRows}
<tfoot>
<tr><td>${needImgs} files</td><td></td><td></td><td class="num">$${needCost.toFixed(2)}</td></tr>
<tr><td>Plus rejects, ~25%</td><td></td><td></td><td class="num">$${(needCost * 0.25).toFixed(2)}</td></tr>
<tr><td><b>Cogfall, drawn</b></td><td></td><td></td><td class="num"><b>&asymp; $${(needCost * 1.25).toFixed(2)}</b></td></tr>
</tfoot>
</table></div>
<p class="meta">Three a run on a contact sheet, so three runs. The code side is a row in
<code>TOWNS</code>, an entry in <code>ACTS</code> with its quests, and <code>cogwork</code> wired
into <code>town-art.js</code> &mdash; all free, and none of it written yet.</p>

<footer>
<hr class="rule">
<p class="meta">Generated by <code>scripts/sheet-town8.mjs</code> &middot;
${Object.keys(files).length} live sprites, served as files &middot;
<code>GATING_LIVE = ${String(GATING_LIVE)}</code></p>
</footer>

</div>
`);

fs.writeFileSync(MANIFEST, JSON.stringify(files, null, 1));
console.log(`${OUT} — ${Object.keys(files).length} sprites, Cogfall needs ${needImgs} at $${needCost.toFixed(2)}`);
