// ── LOOK AT THE NINE EFFECTS, SIDE BY SIDE, BEFORE SPENDING ANYTHING ────────────────────────────────────────
// Luke: "from the pics you are sending it looks like you are using primary shapes and css? Aren't you able to
// make like real effects?"
//
// Two separate questions hide in that, and only one of them costs money:
//   1. do the nine effects READ as nine different things    <- a looking problem, free
//   2. is the art painted or made of gradients              <- an art problem, billable
//
// This answers (1) for free and narrows (2) to the shapes that genuinely have no art yet. Every judgement I
// got wrong on this feature so far — a spray that rendered as a red cartoon star, a dome 14 units tall
// against a 7-unit body — was wrong because I reasoned about CSS instead of looking at a picture.
//
// ⚠️ IT INJECTS THE REAL STYLESHEET. GROVE_CSS is imported, not retyped, so this cannot flatter the game by
// previewing rules the game does not have. The one thing it fakes is --gv-unit, which GroveScene computes
// from the viewport at runtime (line ~3374); a fixed value here stands in for a known screen size.
//
//   node scripts/fx-sheet.mjs            write the sheet
//   node scripts/fx-sheet.mjs --shot     write it and photograph it
import path from "node:path";
import { writeFileSync } from "node:fs";

import { GROVE_CSS } from "@/components/grove/grove-css.js";

const OUT = "scripts/_fx-grove-skills.html";
// The nine, with the primary skill each one speaks for, so the sheet is readable as the tree rather than as
// a list of class names.
const SHAPES = [
    ["bolt", "Might · Reservoir · Cataclysm", 0],
    ["column", "Kindle · Emberheart · Soulfire", 0],
    ["shards", "Frost · Rime · Ironhide", 1],
    ["slash", "Killing Edge · Riposte", 1],
    ["spray", "Bloodletting · Savage · Exsanguinate", 1],
    ["dome", "Bulwark · Deflect · Bastion", 1],
    ["claw", "Rend · Bloodscent", 1],
    ["flurry", "Quickblade · Red Harvest", 1],
    ["aura", "Constitution · Frenzy · Immolate", 0],
];
// Which ones are backed by painted art, read off the source rather than restated — the same reason check:sfx
// parses it instead of keeping its own copy. A second hand-maintained list is a second thing to go stale.
const scene = (await import("node:fs")).readFileSync("src/components/grove/GroveScene.js", "utf8");
const artBlock = (scene.match(/const ART_BY_SHAPE = \{([\s\S]*?)\n        \};/) || [])[1] || "";
const ART = Object.fromEntries([...artBlock.matchAll(/([a-z]+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
const ART_W = Object.fromEntries([...(scene.match(/const ART_W = \{([^}]*)\}/) || ["", ""])[1]
    .matchAll(/([a-z]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));

// ⚠️ ART PATHS ARE SITE-ABSOLUTE AND THIS PAGE IS OPENED OVER file://, where a leading slash means the root
// of the DRIVE. The first run of this sheet showed six empty boxes for exactly that reason, which is the same
// silent-missing-image failure check:sfx exists to catch — so resolve them against public/ explicitly.
const PUB = `file:///${process.cwd().split(path.sep).join("/")}/public`;

// Read off the disk, not listed by hand — a second hand-maintained list is a second thing to go stale, and
// this one exists precisely to tell me what is really there.
const PEAKS = (await import("node:fs")).readdirSync("public/images/arena/vfx")
    .filter((f) => f.endsWith("-peak.webp")).sort();

const cell = ([shape, skills]) => {
    const art = ART[shape];
    return `
    <figure class="cell">
      <div class="stage" style="--gv-unit: 7px; --gv-ground: 18%;">
        <div class="body"></div>
        <i class="gv-sfx is-${shape}${art ? " has-art" : ""}"
           style="left: 50%; bottom: 18%;${art ? ` --art: url('${PUB}${art}'); --art-w: ${ART_W[shape] || 10};` : ""}"></i>
      </div>
      <figcaption><b>${shape}</b>${art ? ` <span class="tag art">painted</span>` : ` <span class="tag css">shape</span>`}
        <small>${skills}</small></figcaption>
    </figure>`;
};

const html = `<!doctype html><meta charset="utf-8"><title>Grove skill effects</title>
<style>
  body { margin: 0; background: #0b0f0c; color: #cfe6d4; font: 13px/1.5 system-ui, sans-serif; padding: 18px; }
  h1 { font-size: 15px; letter-spacing: .08em; text-transform: uppercase; color: #8fcf9f; margin: 0 0 4px; }
  p.sub { margin: 0 0 18px; color: #6f8a76; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 1180px; }
  .cell { margin: 0; }
  /* A dark ground and a body the size of a real one, because every scale mistake I made on this feature was
     invisible without something to compare against. The block is ~7 units, like the hero. */
  .stage { position: relative; height: 210px; border-radius: 10px; overflow: hidden;
    background: linear-gradient(#16231a 0%, #16231a 82%, #24331f 82%, #1b2718 100%);
    border: 1px solid #243025; }
  .body { position: absolute; left: 50%; bottom: 18%; width: 49px; height: 49px; margin-left: -24.5px;
    background: #3b4a3d; border-radius: 4px 4px 2px 2px; }
  figcaption { padding: 7px 2px 0; }
  figcaption b { color: #e6f3e9; }
  figcaption small { display: block; color: #6f8a76; font-size: 11px; }
  .tag { font-size: 10px; padding: 1px 6px; border-radius: 99px; vertical-align: 1px; }
  .tag.art { background: #1f3a24; color: #8fe0a4; }
  .tag.css { background: #3a2f1f; color: #e0c48f; }
  /* PIN each effect at its peak instead of letting it loop. A looping animation photographed at an
     arbitrary moment caught three of them at opacity 0 and I read the blank cells as missing art, which
     is a false alarm that costs a whole debugging pass. A negative delay with the animation paused seeks
     to a fixed point in the timeline, so this sheet is the same picture every run. */
  .gv-sfx { animation-play-state: paused !important; animation-delay: -0.13s !important;
    animation-iteration-count: infinite !important; }
</style>
<h1>Grove skill effects — all nine</h1>
<p class="sub">Real GROVE_CSS, injected. Grey block is a body at true scale (~7 units).
  ${Object.keys(ART).length} of ${SHAPES.length} backed by painted art.</p>
<div class="grid">${SHAPES.map(cell).join("")}</div>

<h1 style="margin-top:26px">every painted frame on disk</h1>
<p class="sub">⚠️ What each file actually DEPICTS, which is not reliably what it is named. The first mapping
  guessed from filenames and put the fire explosion on Rend and the claw streaks on Quickblade.
  Left half of each cell is screen-blended as the game composites it; right half is the raw file.</p>
<div class="grid">${PEAKS.map((f) => `
    <figure class="cell">
      <div class="stage" style="background:#11180f">
        <div style="position:absolute; inset:0; background-image:url('${PUB}/images/arena/vfx/${f}');
             background-size:contain; background-position:center; background-repeat:no-repeat;
             mix-blend-mode:screen; clip-path:inset(0 50% 0 0);"></div>
        <div style="position:absolute; inset:0; background-image:url('${PUB}/images/arena/vfx/${f}');
             background-size:contain; background-position:center; background-repeat:no-repeat;
             clip-path:inset(0 0 0 50%);"></div>
        <div style="position:absolute; top:0; bottom:0; left:50%; width:1px; background:#2c3a2e;"></div>
      </div>
      <figcaption><b>${f.replace("-peak.webp", "")}</b></figcaption>
    </figure>`).join("")}</div>
<style>${GROVE_CSS}</style>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${Object.keys(ART).length} painted, ${SHAPES.length - Object.keys(ART).length} still CSS shapes`);
for (const [s] of SHAPES) console.log(`  ${s.padEnd(8)} ${ART[s] ? `painted  ${ART[s]}` : "css shape"}`);

if (process.argv.includes("--shot")) {
    const { launchChrome, attach } = await import("./lib/qa-chrome.mjs");
    const chrome = launchChrome(9371, "fx-sheet-profile");
    const ws = new WebSocket(await attach(9371));
    await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
    let id = 0; const pending = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
    const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1900, deviceScaleFactor: 2, mobile: false });
    const url = `file:///${process.cwd().replace(/\\/g, "/")}/${OUT}`;
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 2600));
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync("scripts/_fx-grove-skills.png", Buffer.from(data, "base64"));
    console.log("shot scripts/_fx-grove-skills.png");
    ws.close(); chrome.kill();
}
