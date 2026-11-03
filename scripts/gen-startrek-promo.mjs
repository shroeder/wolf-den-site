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
  /* ── THE DESIGN ─────────────────────────────────────────────────────────────────────────────────────
     Luke: "the visuals of it all just need work. Take a professional design eye pass on it."

     What was wrong with the previous one, specifically, because "make it nicer" is not actionable:

       · EVERYTHING WAS CENTRED AND EVENLY SPACED. Eight elements stacked down the middle with similar
         gaps reads as a slide, not an ad: no hierarchy, so the eye has nowhere to land first.
       · THE BOX FLOATED IN A VOID. A cut-out with a shadow pointing nowhere, in the middle of a dark
         field, looks pasted on. Objects need a surface and a light source.
       · THREE PILL SHAPES competed, so the loudest thing on the poster was its punctuation.
       · THE TYPE SCALE WAS FLAT. A 44px title against a 112px price with a 29px pill between them is
         three sizes doing one job.

     Instead: one accent colour and nothing else coloured; a real type scale with big jumps; a
     left-aligned block on a grid so the eye tracks down one edge; the product lit and sitting on a
     surface; and the three facts a buyer needs — what it is, what it costs, when it comes — in that
     order, with no decoration between them. */

  * { box-sizing: border-box; }
  :root {
    --gold: #c9a24d;
    --ink: #f6f1e7;
    --muted: #8d9aa4;
    --edge: rgba(201,162,77,0.30);
  }
  body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; position: relative;
    font-family: Manrope, system-ui, sans-serif; color: var(--ink);
    background: #06080a; }

  /* The lit stage. One warm pool behind the product gives the scene a light source, which is the
     difference between a photograph ON a background and a product ON A SET. */
  .stage { position: absolute; inset: 0;
    background:
      radial-gradient(58% 42% at ${WIDE ? "27%" : "50%"} ${WIDE ? "46%" : "34%"},
        rgba(104,132,150,0.30) 0%, rgba(60,80,94,0.13) 38%, rgba(0,0,0,0) 72%),
      radial-gradient(120% 110% at 50% 0%, #121a21 0%, #0b1016 46%, #06080a 100%); }
  /* A faint star field, built from gradients so there is no asset to load. It reads as space at a
     glance and as texture up close — the set is Star Trek, and a flat black field says nothing. */
  .stars { position: absolute; inset: 0; opacity: 0.5;
    background-image:
      radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,0.55), transparent),
      radial-gradient(1.4px 1.4px at 78% 12%, rgba(255,255,255,0.42), transparent),
      radial-gradient(1.2px 1.2px at 64% 30%, rgba(255,255,255,0.35), transparent),
      radial-gradient(1.6px 1.6px at 30% 8%, rgba(255,255,255,0.38), transparent),
      radial-gradient(1.2px 1.2px at 88% 36%, rgba(255,255,255,0.30), transparent),
      radial-gradient(1.3px 1.3px at 6% 42%, rgba(255,255,255,0.26), transparent),
      radial-gradient(1.5px 1.5px at 45% 6%, rgba(255,255,255,0.30), transparent),
      radial-gradient(1.2px 1.2px at 92% 8%, rgba(255,255,255,0.34), transparent); }
  /* Hairline frame, pulled in tight. One pixel of gold, not a border. */
  .frame { position: absolute; inset: 18px; border: 1px solid var(--edge); pointer-events: none; }

  .sheet { position: relative; width: 100%; height: 100%;
    display: flex; flex-direction: ${WIDE ? "row" : "column"}; align-items: center;
    ${WIDE ? "" : "justify-content: flex-end;"}
    padding: ${WIDE ? "44px 70px 44px 52px" : "22px 74px 52px"}; ${WIDE ? "gap: 34px;" : ""} }

  /* ── the product on its surface ─────────────────────────────────────────────────────────────────── */
  /* ⚠️ A FIXED SHARE OF THE HEIGHT, AND THE BOX CENTRES INSIDE IT. Letting the hero size itself to the
     image pushed the box flush against the top frame with no air above it — a product crowding the edge
     of the canvas reads as a crop, not as a composition. */
  .hero { position: relative; display: flex; align-items: center; justify-content: center;
    ${WIDE ? "flex: 0 0 430px; height: 100%;" : "width: 100%; flex: 0 0 43%;"} }
  /* ⚠️ NEVER WIDER THAN THE 400px SOURCE FILE. */
  .shot { width: ${WIDE ? 348 : 322}px; max-width: 400px; display: block; position: relative; z-index: 2;
    filter: drop-shadow(0 10px 14px rgba(0,0,0,0.5)); }
  /* The contact shadow: a TIGHT dark ellipse where the box meets the floor. This is the one thing that
     stops a cut-out looking pasted on, and it has to be tight — a big soft blur under everything is
     just a smudge. */
  .hero::after { content: ""; position: absolute; z-index: 1;
    left: 50%; bottom: ${WIDE ? 6 : 10}px; transform: translateX(-50%);
    width: ${WIDE ? 300 : 280}px; height: 30px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.44) 45%, rgba(0,0,0,0) 72%);
    filter: blur(9px); }

  /* ── the words ──────────────────────────────────────────────────────────────────────────────────── */
  .copy { display: flex; flex-direction: column; align-items: flex-start;
    ${WIDE ? "flex: 1;" : "width: 100%;"} }
  .mark { width: ${WIDE ? 232 : 248}px; height: auto; display: block;
    margin: ${WIDE ? "-14px 0 14px -6px" : "-26px 0 -16px -8px"}; }

  /* Eyebrow: the terms of the sale, in the shop's accent, letterspaced so it reads as a LABEL rather
     than as a sentence. */
  .eyebrow { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 21 : 22}px; letter-spacing: .22em; text-transform: uppercase;
    color: var(--gold); margin: 0 0 ${WIDE ? 12 : 14}px; }
  .eyebrow span { color: var(--muted); }

  h1 { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 52 : 56}px; line-height: 0.98; letter-spacing: -0.015em;
    margin: 0 0 ${WIDE ? 20 : 24}px; color: #ffffff; }

  /* Price and the facts beside it: one baseline-aligned row, so the number dominates without floating
     loose in the middle of the poster. */
  /* ⚠️ SPACE-BETWEEN, NOT A GAP. Bunched at the left, the price and the facts left the whole right half
     of the poster empty and the block read as unfinished. Pushed apart they span the measure, and the
     rule beneath them has something to span. */
  .row { display: flex; align-items: flex-end; justify-content: space-between; gap: ${WIDE ? 26 : 30}px;
    padding-bottom: ${WIDE ? 20 : 22}px; margin-bottom: ${WIDE ? 20 : 22}px;
    border-bottom: 1px solid rgba(255,255,255,0.10); width: 100%; }
  .price { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 104 : 118}px; line-height: 0.84; color: #ffffff; letter-spacing: -0.03em; }
  .facts { display: flex; flex-direction: column; align-items: flex-end; text-align: right;
    gap: ${WIDE ? 7 : 8}px; padding-bottom: ${WIDE ? 5 : 8}px; }
  .fact { font-weight: 700; font-size: ${WIDE ? 21 : 22}px; color: var(--ink); line-height: 1.15;
    white-space: nowrap; }
  .fact b { color: var(--gold); font-weight: 800; }
  .fact i { display: block; font-style: normal; font-weight: 500; font-size: ${WIDE ? 15 : 15}px;
    letter-spacing: .13em; text-transform: uppercase; color: var(--muted); margin-bottom: 1px; }

  .cta { display: flex; align-items: baseline; gap: 12px; width: 100%; }
  .cta .go { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 19 : 19}px; letter-spacing: .2em; text-transform: uppercase; color: var(--muted); }
  .cta .site { font-family: "Space Grotesk", Manrope, sans-serif; font-weight: 700;
    font-size: ${WIDE ? 30 : 33}px; color: var(--gold); letter-spacing: -0.01em; }
</style>
<div class="stage"></div>
<div class="stars"></div>
<div class="frame"></div>
<div class="sheet">
  <div class="hero"><img class="shot" src="${BOX}" alt="" /></div>
  <div class="copy">
    <img class="mark" src="${LOGO}" alt="" />
    <p class="eyebrow">Pre-order <span>&middot;</span> Magic &times; Star Trek</p>
    <h1>Collector Booster Display</h1>
    <div class="row">
      <div class="price">${PRICE}</div>
      <div class="facts">
        <div class="fact"><i>Available</i><b>${COUNT}</b> displays</div>
        <div class="fact"><i>Arrives</i>${ARRIVES}</div>
      </div>
    </div>
    <div class="cta"><span class="go">Order at</span><span class="site">${SITE}</span></div>
  </div>
</div>
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
