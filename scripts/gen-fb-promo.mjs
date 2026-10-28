// ── THE FACEBOOK POST ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "advertise the online game in all of its glory, so it should just be a bunch of awesome sprites ...
// clustered all on top of each other in the four different corners of the image. And in the middle, I really
// want people to understand that you can play for free and earn real world prizes."
//
// ⚠️ NOTHING HERE IS DRAWN. Every sprite is art the game already shipped, read off /public/images — a promo
// image is the one job where generating new art is pure waste, because the whole point is to show what is
// actually in the game. See [[check-existing-sprites-first]].
//
// ⚠️ AND IT IS COMPOSED IN A BROWSER, NOT IN sharp. The site's display face is Space Grotesk, loaded by
// next/font — there is no .ttf on this machine for an SVG text node to use, so a sharp composite would have
// set the headline in Arial and quietly looked like a different company's ad. Chrome has the real font, real
// text shaping, and real CSS shadows, so the poster is laid out as a page and photographed.
//
// Usage:  node scripts/gen-fb-promo.mjs [out.png] [--size 1200]
//         (no dev server needed — every sprite is read off disk and inlined, see the alpha note below)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const OUT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "fb-promo.png";
const SIZE = Number(process.argv[process.argv.indexOf("--size") + 1]) || 1200;
const PORT = 9444;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ── ⚠️ "TRANSPARENT" IS NOT ALWAYS ZERO, AND drop-shadow BELIEVES IT ─────────────────────────────────────────
// The first render put a faint grey RECTANGLE behind the gems. Their background is alpha 1-2 rather than 0 --
// invisible on its own, and invisible everywhere else in the game, because nothing else asks the GPU to trace
// the shape. A CSS drop-shadow does exactly that, and alpha 1 is a shape: the full 1024px plate. So every
// sprite goes through an alpha floor on the way in, and the shadow then traces the creature.
//
// It also means the poster no longer needs the dev server -- the art is read off disk and inlined, so this
// runs on a plane.
const ALPHA_FLOOR = 40;
async function inlineSprite(rel, displayW) {
    const file = path.join(process.cwd(), "public", rel);
    const src = sharp(file).resize({ width: Math.round(displayW * 2.2), withoutEnlargement: true });
    const { data, info } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= ALPHA_FLOOR) data[i] = 0;
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9 }).toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
}

// ── THE FOUR CLUSTERS ────────────────────────────────────────────────────────────────────────────────────────
// One THEME per corner, so the pile reads as four things the game lets you do rather than as twenty-eight
// unrelated drawings: the forest you fight, the loot you win, the sea you sail, the fire you walk into.
//
// ⚠️ DIE-CUT SPRITES ONLY. Card art, island plates and the delve backdrops are rectangular scenes with their
// own painted backgrounds — dropped into a cluster they read as photographs lying on the table, and the
// overlap stops being a pile. Anything here must have a transparent background.
//
// x/y are percentages of the CLUSTER's own box, so a corner can be moved without re-tuning seven sprites.
const CLUSTERS = {
    // Top left — the Grove. The white stag anchors it because it is the one pale silhouette in 84 bosses.
    tl: [
        { src: "grove/boss-the_white.webp", x: 37, y: 43, w: 299, r: -6, z: 6 },
        { src: "grove/boss-great_weaver.webp", x: 18, y: 18, w: 230, r: -12, z: 3 },
        { src: "grove/boss-lanternwing.webp", x: 54, y: 18, w: 215, r: 10, z: 5 },
        { src: "grove/boss-capmother.webp", x: 57, y: 47, w: 215, r: 7, z: 4 },
        { src: "grove/boss-sporecrown.webp", x: 20, y: 46, w: 204, r: -4, z: 2 },
        { src: "grove/boss-the_tusked.webp", x: 37, y: 18, w: 189, r: 2, z: 1 },
        { src: "grove/boss-the_opal_queen.webp", x: 52, y: 38, w: 182, r: 6, z: 0 },
    ],
    // Top right — the payout. Gems, coins and the gold pig: the corner that has to say "earn" without words.
    tr: [
        { src: "bonus/bounty.png", x: 34, y: 46, w: 260, r: -5, z: 6 },
        { src: "gems/amethyst_t5.png", x: 18, y: 28, w: 174, r: -14, z: 4 },
        { src: "gems/ruby_t5.png", x: 53, y: 24, w: 169, r: 12, z: 5 },
        { src: "gems/emerald_t5.png", x: 58, y: 50, w: 165, r: -8, z: 3 },
        { src: "gems/sapphire_t5.png", x: 20, y: 51, w: 160, r: 9, z: 2 },
        { src: "casino/bank_gold.webp", x: 37, y: 17, w: 200, r: 4, z: 1 },
        { src: "grove/boss-the_gilded_queen.webp", x: 63, y: 17, w: 184, r: 8, z: 0 },
        { src: "gems/topaz_t5.png", x: 40, y: 32, w: 140, r: 16, z: 7 },
    ],
    // Bottom left — sailing and fishing. The celestial hull is the top of a twelve-boat ladder, so it is the
    // one that says "there is a long way up" to anyone who already plays.
    bl: [
        { src: "sailing/boat-tier11-celestial.png", x: 26, y: 36, w: 300, r: -4, z: 6 },
        { src: "sailing/boat-tier8-dragon.png", x: 18, y: 20, w: 234, r: 6, z: 3 },
        { src: "fish/fish_anglerfish.png", x: 57, y: 24, w: 215, r: -10, z: 5 },
        { src: "fish/fish_hadaloctopus.png", x: 20, y: 54, w: 200, r: 8, z: 4 },
        { src: "fish/fish_dolphin.png", x: 55, y: 60, w: 196, r: 12, z: 2 },
        { src: "fleet/fleet_boss_revenge.png", x: 41, y: 17, w: 189, r: -8, z: 1 },
        { src: "sailing/boat-tier5-galleon.png", x: 44, y: 20, w: 205, r: 7, z: 0 },
        { src: "fish/fish_glassfin.png", x: 62, y: 46, w: 155, r: -14, z: 7 },
    ],
    // Bottom right — the fights. Everything in this corner is on fire on purpose; it is the warmest corner
    // and it sits under the call to action.
    br: [
        { src: "grove/boss-the_forge_wraith.webp", x: 35, y: 41, w: 289, r: 5, z: 6 },
        { src: "casino/bingo-dragon.webp", x: 54, y: 20, w: 230, r: -8, z: 5 },
        { src: "grove/boss-rattlerind.webp", x: 18, y: 24, w: 215, r: -6, z: 4 },
        { src: "grove/boss-cinderback.webp", x: 20, y: 53, w: 210, r: 8, z: 3 },
        { src: "bonus/broadside.png", x: 58, y: 54, w: 189, r: -12, z: 2 },
        { src: "bonus/ferocity.png", x: 39, y: 18, w: 165, r: 4, z: 1 },
        { src: "grove/boss-everburning.webp", x: 28, y: 56, w: 185, r: -5, z: 0 },
    ],
};

// Inline every sprite up front: the markup below is built from strings, so the bytes have to exist first.
for (const list of Object.values(CLUSTERS)) {
    for (const s of list) s.uri = await inlineSprite(path.join("images", s.src), s.w);
}
const logoUri = await inlineSprite("logo/logo.png", 168);

const sprites = (key, box) => `
  <div class="cluster ${key}" style="${box}">
    ${CLUSTERS[key].map((s) => `<img class="sp" src="${s.uri}" alt=""
        style="left:${s.x}%; top:${s.y}%; width:${s.w}px; z-index:${s.z}; --r:${s.r}deg" />`).join("")}
  </div>`;

// ⚠️ THE CLAIMS ARE THE ONES THE SITE ALREADY MAKES, WORD FOR WORD WHERE IT MATTERS: "win real Wolf Den
// prizes — a physical raffle prize, in-game loot, and a loot chest for everyone who fights" (the home page's
// weekly boss card) and "Free to join" (the rewards card). An ad that promises more than the page it links to
// is a complaint waiting to happen, and this one is going on the shop's own Facebook.
const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; background: #0a0b10;
         font-family: Manrope, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  .stage { position: relative; width: ${SIZE}px; height: ${SIZE}px; overflow: hidden;
    /* Warm in the middle, cold at the edges: the centre has to stay the brightest thing in the frame or the
       eye goes to the monsters and never reads the offer. */
    background:
      radial-gradient(70% 55% at 50% 50%, #1d2033 0%, #12131d 45%, #0a0b10 100%),
      #0a0b10; }
  /* The pile. Each corner is its own box so the sprites can overlap hard inside it and never wander into
     the text. */
  /* WARNING: THE OFFSETS ARE SMALL ON PURPOSE. The first pass hung each box 70px off the edge and the pile
     read as four sprites that had been CROPPED rather than four that were piled -- a cut-off hull and half a
     stag. A cluster may overlap the edge by a nose; it must not lose a subject. */
  .cluster { position: absolute; width: 520px; height: 520px; }
  .sp { position: absolute; transform: rotate(var(--r)) translateZ(0);
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.75)); }
  /* A soft dark wash over the outer edges, so the clusters sit BEHIND the message rather than beside it. */
  .vignette { position: absolute; inset: 0; z-index: 50; pointer-events: none;
    background: radial-gradient(58% 48% at 50% 50%, rgba(10,11,16,0.94) 0%, rgba(10,11,16,0.86) 38%, rgba(10,11,16,0.30) 62%, rgba(10,11,16,0) 78%); }
  .middle { position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center; padding: 0 128px; }
  /* ⚠️ WIDTH ONLY. logo.png is 1536x1024 — a 3:2 mark. Giving it a square box squashed the wolf by a
     third, which reads as a slightly wrong logo rather than as an obvious bug, and nothing in a contact
     sheet or a thumbnail would have caught it. Never set both axes on this file. */
  .mark { width: 168px; height: auto; margin-bottom: 10px;
          filter: drop-shadow(0 0 26px rgba(255,196,84,0.45)); }
  .eyebrow { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700; font-size: 25px;
             letter-spacing: 0.34em; text-transform: uppercase; color: #ffc85a; margin-bottom: 16px; }
  h1 { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700; font-size: 93px; line-height: 0.97;
       letter-spacing: -0.02em; color: #fff; text-shadow: 0 6px 34px rgba(0,0,0,0.9); }
  h1 .gold { background: linear-gradient(180deg, #ffe49a 0%, #ffb52e 62%, #e08a12 100%);
             -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { margin-top: 24px; font-size: 29px; line-height: 1.42; font-weight: 500; color: #cfd4e4;
         max-width: 760px; text-shadow: 0 3px 16px rgba(0,0,0,0.95); }
  .sub b { color: #fff; font-weight: 800; }
  .cta { margin-top: 32px; display: inline-flex; align-items: center; gap: 14px;
         padding: 17px 34px; border-radius: 999px; font-size: 27px; font-weight: 800; letter-spacing: 0.01em;
         color: #1a1206; background: linear-gradient(180deg, #ffd978 0%, #f0a81f 100%);
         box-shadow: 0 10px 34px rgba(240,168,31,0.34); }
  .host { margin-top: 18px; font-size: 24px; font-weight: 700; letter-spacing: 0.08em; color: #8e97b0; }
</style></head>
<body>
  <div class="stage">
    ${sprites("tl", "left:-34px; top:-22px;")}
    ${sprites("tr", "right:-34px; top:-22px;")}
    ${sprites("bl", "left:-34px; bottom:-14px;")}
    ${sprites("br", "right:-34px; bottom:-14px;")}
    <div class="vignette"></div>
    <div class="middle">
      <img class="mark" src="${logoUri}" alt="" />
      <div class="eyebrow">Free to play</div>
      <h1>Play free.<br /><span class="gold">Win real prizes.</span></h1>
      <p class="sub">Fight the weekly boss, fish, farm, sail and build your hero — and win
        <b>real Wolf Den prizes</b>: a physical raffle prize, in-game loot, and a loot chest for everyone
        who fights.</p>
      <div class="cta">Play free at The Wolf Den</div>
      <div class="host">WOLFDENGAMINGMN.COM</div>
    </div>
  </div>
</body></html>`;

const tmp = path.join(process.env.TEMP || ".", `fb-promo-${SIZE}.html`);
fs.writeFileSync(tmp, html, "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`,
    "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i += 1) {
    await sleep(250);
    try {
        wsUrl = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()))
            .find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* chrome not up yet */ }
}
if (!wsUrl) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(wsUrl);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
// The sprites are static assets with a day of max-age and this profile is reused, so a redraw would be
// photographed as the previous art — the same trap shot.mjs documents.
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: SIZE, height: SIZE, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: `file:///${tmp.replace(/\\/g, "/")}` });
await sleep(3500);

// ⚠️ PROVE THE ART ARRIVED. Twenty-five <img> tags that 404 still lay out, still screenshot, and hand back a
// perfectly composed picture of an empty stage with a headline on it.
const check = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
        const imgs = [...document.images];
        return { total: imgs.length, broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src),
                 font: document.fonts.check("700 93px 'Space Grotesk'") };
    })()`,
});
const state = check?.result?.value;
if (!state || state.broken.length) {
    console.error(`gen-fb-promo: ${state?.broken.length} image(s) did not decode — a path in CLUSTERS is wrong`);
    (state?.broken || []).slice(0, 6).forEach((s) => console.error(`  ${s.slice(0, 90)}`));
    sock.close(); chrome.kill(); process.exit(1);
}
if (!state.font) console.log("gen-fb-promo: ⚠️ Space Grotesk did not load — the headline is in a fallback face");

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
console.log(`${OUT}  ${SIZE}x${SIZE} @2x  (${state.total} sprites, ${Math.round(fs.statSync(OUT).size / 1024)}kb)`);
sock.close();
chrome.kill();
