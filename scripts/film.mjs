// ── FILM A MOMENT, FRAME BY FRAME ────────────────────────────────────────────────────────────────────────────
// A screenshot cannot judge an animation. It cannot tell you whether the pause before a counter reads as an
// answer or as a stutter, whether the callout has cleared before the number arrives, or whether the whole
// thing is over before a thumb has left the glass. Those are questions about ORDER and TIMING, and the only
// way to answer them is to look at the frames.
//
// So: drive the page over CDP, fire the moment, and grab a frame every FRAME_MS until it is done. Then build
// a contact sheet out of the frames — one image, numbered, in reading order — because thirty separate PNGs is
// thirty separate looks and a strip is one.
//
// Run against the arena lab (dev only), where a counter can be made to happen on every beat:
//   node scripts/film.mjs "http://localhost:3000/marketplace/arena/lab?scene=counter&chrome=0" out/counter \
//        --click ".ar-cmd" --frames 26 --every 60 --w 390 --h 800
//
// TRAPS, all of which have produced a confident wrong answer here before:
//   · Chrome clamps --window-size to ~500px. Emulation.setDeviceMetricsOverride is the only real viewport.
//   · Page.captureScreenshot is not free — it costs 30-60ms, so FRAME_MS is a floor, not a promise. Every
//     frame is stamped with the real elapsed ms and the sheet prints it. Trust the stamp, not the interval.
//   · CSS animations run on the compositor; a frame grabbed mid-transition is exactly what we want to see,
//     but it means two runs are never identical. Judge the SHAPE across frames, not one frame.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const outBase = process.argv[3] || "frames";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const CLICK = arg("--click", null);
const FRAMES = Number(arg("--frames", 24));
const FRAME_MS = Number(arg("--every", 60));
const W = Number(arg("--w", 390));
const H = Number(arg("--h", 800));
const PORT = 9411;
const SETTLE = Number(arg("--settle", 4200));
// Capture cost IS the frame rate. A 2x PNG of a phone viewport costs ~400ms to encode, which films a 420ms
// beat as one frame — the tool would have answered the timing question by destroying it. JPEG at 1x is ~60ms.
const DPR = Number(arg("--dpr", 1));
const DELAY = Number(arg("--delay", 0));

if (!url) throw new Error("usage: node scripts/film.mjs <url> <outBase> [--click sel] [--frames n] [--every ms]");
if (!existsSync(dirname(outBase)) && dirname(outBase) !== ".") mkdirSync(dirname(outBase), { recursive: true });

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-film-${PORT}`,
    // Animations must run at real speed for the timing to mean anything.
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        const page = list.find((t) => t.type === "page");
        if (page) ws = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
const events = [];
sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    // ── SCREENCAST, NOT SCREENSHOT ───────────────────────────────────────────────────────────────────────
    // Page.captureScreenshot blocks until the compositor hands over a fresh frame, which on a page full of
    // running animations cost 400-1400ms per grab — the tool would have "filmed" a 420ms beat at one frame
    // per beat and answered the timing question by destroying it. startScreencast PUSHES frames as they are
    // painted, at real speed, each stamped by the browser itself.
    if (m.method === "Page.screencastFrame") {
        events.push({ at: Date.now(), data: m.params.data });
        send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
    }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await send("Page.navigate", { url });
await sleep(SETTLE);

const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;

// FIRE IT. The click has to land on an attached handler, so it is retried and its effect confirmed — the
// same rule shot.mjs learned: a click into un-hydrated HTML dispatches into nothing and the film comes out
// as thirty frames of a page sitting still, which looks like a broken animation rather than a missed tap.
let fired = false;
if (CLICK) {
    for (let i = 0; i < 20 && !fired; i += 1) {
        fired = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(CLICK)});
            if (!el || el.disabled) return false;
            el.click();
            return true;
        })()`);
        if (!fired) await sleep(250);
    }
    if (!fired) { chrome.kill(); throw new Error(`nothing clickable matched ${CLICK} — nothing was filmed`); }
}

if (DELAY) await sleep(DELAY);   // let a wind-up play out before the part worth filming
const t0 = Date.now();
await send("Page.startScreencast", { format: "jpeg", quality: 72, everyNthFrame: 1, maxWidth: W, maxHeight: H });
await sleep(FRAMES * FRAME_MS);
await send("Page.stopScreencast");
// The browser paints when it has something to paint, so the raw stream is uneven — thin it to the requested
// spacing rather than pretending every painted frame is a sample.
const all = events.map((f) => ({ at: f.at - t0, data: f.data })).sort((a, z) => a.at - z.at);
const frames = [];
for (const f of all) {
    if (!frames.length || f.at - frames[frames.length - 1].at >= FRAME_MS * 0.8) frames.push(f);
    if (frames.length >= FRAMES) break;
}
if (!frames.length) { chrome.kill(); throw new Error("the screencast produced no frames"); }
console.log(`captured ${all.length} painted frames, sampled ${frames.length}`);

// ── THE CONTACT SHEET ────────────────────────────────────────────────────────────────────────────────────────
// Frames as data URIs in a grid, each stamped with the millisecond it was taken, shot as one image. One look
// instead of thirty, and the stamps are what make it readable as time rather than as a set of pictures.
const cols = Math.min(6, frames.length);
const sheet = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #0b0b0f; font: 12px/1.2 ui-monospace, monospace; color: #ffcf7a; }
  .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 6px; padding: 8px; }
  figure { margin: 0; }
  img { width: 100%; display: block; border: 1px solid #2a2a34; }
  figcaption { padding: 3px 2px; color: #ffcf7a; }
</style><div class="grid">
${frames.map((f, i) => `<figure><img src="data:image/jpeg;base64,${f.data}"><figcaption>${String(i).padStart(2, "0")} · ${f.at}ms</figcaption></figure>`).join("\n")}
</div>`;
const sheetPath = `${outBase}-sheet.html`;
writeFileSync(sheetPath, sheet);

// Shoot the sheet itself, tall enough to hold every row.
const rows = Math.ceil(frames.length / cols);
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: Math.max(400, rows * 300 + 40), deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `file:///${sheetPath.replace(/\\/g, "/")}` });
await sleep(1500);
const sheetShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(`${outBase}-sheet.png`, Buffer.from(sheetShot.data, "base64"));

sock.close();
chrome.kill();
console.log(`${frames.length} frames over ${frames[frames.length - 1].at}ms → ${outBase}-sheet.png`);
