// ── THE STAR TREK PRE-ORDER POST ────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-02: "Lets change the star trek collectors to 450 and get a new image generated for me to post.
// Lets maybe make it a little more appealing and simple, just, we have 6, they are 450, order online, free
// shipping"
//
// Four facts, in the order a buyer needs them: it is a PRE-ORDER landing on a named day, there are six,
// they are $450, you order online. The previous version carried a struck-through $582, a TCGplayer market
// comparison, a pickup option and a town — all true, and together they read as a spec sheet rather than an
// offer. Luke's word was "simple", so everything that is not one of those facts is gone.
//
// ⚠️ "PRE-ORDER" AND THE DATE ARE NOT DECORATION, they are the terms of the sale. An ad that takes $450
// today without saying the product does not exist yet is the single most complainable thing a card shop can
// post, so the word leads the block and the arrival date sits with the price rather than in small print.
//
// ⚠️ THE DATE IS THE STREET DATE, 13 November 2026 — a Friday, and the same date the Square listing and the
// pre-order script carry. Luke: "They should get in by Friday." Both Nov 6 and Nov 13 are Fridays, and
// stock may well land in the shop on the earlier one, but a sealed Magic product cannot be sold or shipped
// before its street date — so the day the BUYER gets it is the 13th either way. Advertising the 6th would
// promise something the shop is not allowed to do.
//
// ⚠️ NO SHIPPING CLAIM. An earlier draft said "free shipping" and checkout charges live EasyPost rates, so
// the ad and the cart contradicted each other. Luke: "Remove free shipping." Nothing about shipping is
// promised here now, which is the only safe state until the checkout rule says otherwise.
//
// ⚠️ NOTHING IS DRAWN BY A MODEL. The box is the publisher's own product photo and the mark is the shop's own
// logo. Generating art for an ad about a specific physical product is the one job where a generated picture
// is strictly worse than the real one — it would be a picture of a box that does not exist.
//
// ⚠️ AND IT IS COMPOSED IN A BROWSER, NOT IN sharp, for the reason gen-fb-promo.mjs documents: the display
// face is a webfont, there is no .ttf on this machine, and a sharp composite would quietly set the headline
// in Arial and look like a different shop's ad.
//
// ⚠️ THE PRODUCT PHOTO IS ONLY 400px WIDE. TCGplayer serves 400w and 403s everything larger, so the box is
// laid out at a size that never upscales it — blowing a 400px jpeg up to fill a 1080 canvas is how an ad
// ends up looking like a screenshot of an ad.
//
// Usage:  node scripts/gen-startrek-promo.mjs [out.png] [--wide]
import { spawn } from "node:child_process";
import fs from "node:fs";

const WIDE = process.argv.includes("--wide");
const OUT = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : (WIDE ? "startrek-promo-wide.png" : "startrek-promo.png");
const W = WIDE ? 1200 : 1080;
const H = WIDE ? 630 : 1080;
const PORT = 9446;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ── THE FACTS ───────────────────────────────────────────────────────────────────────────────────────────
// Kept as named values rather than buried in the markup so the next change is a one-line edit, and so the
// price here cannot silently disagree with the price in Square.
const COUNT = 6;
const PRICE = "$450";
const SITE = "wolfdengamingmn.com";
// The street date, carried as one value so the poster cannot drift from the listing.
const ARRIVES = "Friday, Nov 13";

const b64 = (p) => fs.readFileSync(p).toString("base64");
// ⚠️ THE CUT-OUT, NOT THE RAW JPEG. The publisher photo is on pure white, and dropped straight onto a dark
// poster it reads as a white card pasted over the design -- which is the single thing that made the first
// draft of this look homemade. scripts/lib/cutout.mjs flood-fills the white from the edges inward, so the
// white INSIDE the picture (15 CARDS, the 13+ roundels, the warning label) survives.
const CUT = ".promo/box-cut.png";
if (!fs.existsSync(CUT)) {
    const { cutWhiteBackground } = await import("./lib/cutout.mjs");
    const r = await cutWhiteBackground(".promo/box-400w.jpg", CUT);
    console.log(`cut the background off the product shot (${r.width}x${r.height}, ${r.keptPct}% kept)`);
}
const BOX = `data:image/png;base64,${b64(CUT)}`;
const LOGO = `data:image/png;base64,${b64("public/logo/wolf-den-full-logo.png")}`;

const html = `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: Manrope, system-ui, sans-serif; color: #f4efe6;
    background:
      radial-gradient(130% 95% at 50% 6%, #1d2a33 0%, #121a20 42%, #0a0d10 78%, #07090b 100%);
    display: flex; flex-direction: ${WIDE ? "row" : "column"}; align-items: center;
    ${WIDE ? "gap: 56px; padding: 54px 64px;" : "gap: 0; padding: 26px 60px 44px;"} }
  /* A thin inner rule, the way the shop's other posts are framed. */
  .frame { position: fixed; inset: 16px; border: 1px solid rgba(201,162,77,0.34); border-radius: 8px;
    pointer-events: none; }
  /* The logo file is 1536x1024 with a lot of air around the mark, so it is sized by WIDTH; setting a
     height makes it tiny, which is what the first draft did. */
  .mark { width: ${WIDE ? 300 : 330}px; height: auto; display: block; ${WIDE ? "" : "margin: -22px 0 -30px;"} }
  .stack { display: flex; flex-direction: column; align-items: ${WIDE ? "flex-start" : "center"};
    ${WIDE ? "flex: 1; text-align: left;" : "text-align: center;"} }

  /* ⚠️ THE BOX IS NEVER DRAWN WIDER THAN THE FILE IT CAME FROM (400px). */
  .shot { width: ${WIDE ? 320 : 330}px; max-width: 400px; display: block;
    filter: drop-shadow(0 26px 44px rgba(0,0,0,0.6)); }
  .glow { position: relative; display: flex; align-items: center; justify-content: center;
    ${WIDE ? "" : "margin: 10px 0 2px;"} }
  .glow::before { content: ""; position: absolute; width: 74%; height: 62%; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(78,196,160,0.30) 0%, rgba(78,196,160,0.10) 46%, rgba(78,196,160,0) 72%);
    filter: blur(26px); }

  .count { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 26 : 29}px; letter-spacing: .16em; text-transform: uppercase;
    color: #0c1512; background: #c9a24d; border-radius: 999px;
    padding: ${WIDE ? "8px 20px" : "9px 24px"};
    ${WIDE ? "margin: 14px 0 12px;" : "margin: 0 0 12px;"} }
  .name { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 40 : 42}px; line-height: 1.06; margin: 0 0 ${WIDE ? 8 : 4}px; color: #ffffff; }
  .name small { display: block; font-size: ${WIDE ? 20 : 22}px; font-weight: 500; letter-spacing: .1em;
    text-transform: uppercase; color: #9fb0ad; margin-bottom: 8px; }
  .price { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 100 : 112}px; line-height: 1; color: #ffffff; margin: ${WIDE ? "2px 0 10px" : "0 0 12px"};
    text-shadow: 0 0 46px rgba(201,162,77,0.28); }
  /* The arrival date sits where the eye already is — directly under the price — rather than in small print
     at the foot of the poster, because it is a condition of the price. */
  .lands { display: inline-block; font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 24 : 27}px; letter-spacing: .02em; color: #f4efe6;
    border: 1px solid rgba(201,162,77,0.55); background: rgba(201,162,77,0.10);
    padding: ${WIDE ? "9px 22px" : "11px 26px"}; border-radius: 999px; }
  .lands b { color: #c9a24d; font-weight: 700; }
  .cta { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 27 : 29}px; color: #ffffff; margin-top: ${WIDE ? 16 : 18}px; }
  .cta b { color: #c9a24d; font-weight: 700; }
</style>
<div class="frame"></div>
${WIDE ? `
  <div class="glow"><img class="shot" src="${BOX}" alt="" /></div>
  <div class="stack">
    <img class="mark" src="${LOGO}" alt="" />
    <div class="count">Pre-order &middot; ${COUNT} available</div>
    <h1 class="name"><small>Magic &times; Star Trek</small>Collector Booster Display</h1>
    <div class="price">${PRICE}</div>
    <span class="lands">Arrives <b>${ARRIVES}</b></span>
    <div class="cta">Order online &middot; <b>${SITE}</b></div>
  </div>
` : `
  <img class="mark" src="${LOGO}" alt="" />
  <div class="stack">
    <div class="glow"><img class="shot" src="${BOX}" alt="" /></div>
    <div class="count">Pre-order &middot; only ${COUNT}</div>
    <h1 class="name"><small>Magic &times; Star Trek</small>Collector Booster Display</h1>
    <div class="price">${PRICE}</div>
    <span class="lands">Arrives <b>${ARRIVES}</b></span>
    <div class="cta">Order online &middot; <b>${SITE}</b></div>
  </div>
`}
`;

const tmp = `${process.env.TEMP}/startrek-promo.html`;
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
    } catch { /* not up yet */ }
}
if (!wsUrl) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(wsUrl);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: `file:///${tmp.replace(/\\/g, "/")}` });
await sleep(3200);

// ⚠️ PROVE THE PICTURE ARRIVED AND THE FACE LOADED. A broken img still lays out and still screenshots, and
// a missing webfont silently hands back the same ad set in Arial.
const check = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
        const imgs = [...document.images];
        return { total: imgs.length,
                 broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
                 font: document.fonts.check("700 100px 'Space Grotesk'"),
                 overflow: document.body.scrollWidth > document.body.clientWidth
                        || document.body.scrollHeight > document.body.clientHeight };
    })()`,
});
const st = check?.result?.value;
if (!st || st.broken) { console.error(`gen-startrek-promo: ${st?.broken} image(s) did not decode`); sock.close(); chrome.kill(); process.exit(1); }
if (!st.font) console.log("gen-startrek-promo: ⚠️ Space Grotesk did not load — headline is in a fallback face");
// Overflow means a line wrapped off the canvas, which a screenshot crops away silently.
if (st.overflow) console.log("gen-startrek-promo: ⚠️ content overflows the canvas — something is being cut off");

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
console.log(`${OUT}  ${W}x${H} @2x  (${Math.round(fs.statSync(OUT).size / 1024)}kb)`);
sock.close();
chrome.kill();
