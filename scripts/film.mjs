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
// ── A SEAM TAKES MORE THAN ONE STEP ──────────────────────────────────────────────────────────────────────────
// Filming the hand-off from a cast to a fight needs three things this rig could not do: press a button, WAIT
// for the moment worth filming to arrive on its own clock (a bite lands ~2.6s after the line goes out, and no
// fixed sleep is honest about that), and then TAP — pointerdown, not click. The water's hook handler is
// onPointerDown, so `el.click()` dispatches into nothing and the film comes out as a page sitting still, which
// is exactly the failure mode the click-retry above was written to stop.
const AWAIT = arg("--await", null);   // wait for this selector after the click, before the tap
const TAP = arg("--tap", null);       // pointerdown/up + click, for handlers that listen to pointers
const AWAIT_MS = Number(arg("--await-ms", 15000));
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
// -- SOME THINGS CANNOT BE FILMED BY TAPPING THEM -------------------------------------------------------------
// A minigame needs a thumb held down for six seconds, not a click. This rig could fire exactly one click and
// then watch, which films every interactive feature as the thing sitting still doing nothing -- and that reads
// as a broken animation rather than as a rig that cannot play the game. --eval runs arbitrary JS in the page
// after the click and before the first frame, so a scripted "player" can be installed and filmed at work:
//   node scripts/film.mjs "<lab url>" out/reel --click ".pill" --eval "window.__bot(130)" --frames 16
// (shot.mjs learned the same lesson and grew SHOT_EVAL.)
const EVAL = arg("--eval", null);

if (!url) throw new Error("usage: node scripts/film.mjs <url> <outBase> [--click sel] [--await sel] [--tap sel] [--frames n] [--every ms]");
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
// ── SIGNED IN, AND WITH THE LAUNCH MODALS ALREADY SEEN ───────────────────────────────────────────────────────
// Same two env vars shot.mjs takes, and for the same reason — without them this films the login redirect, or
// a modal sitting on top of the thing being filmed, and reports success either way. Most of the game is
// behind a session, so a film rig that cannot hold one can only film the fixtures.
if (process.env.SHOT_COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(url).hostname, path: "/",
    });
}
//
// `key=value` is supported, and the word `now` means Date.now() — the same as shot.mjs, and for the same
// reason: some markers are TIMESTAMPS rather than flags. The web-push prompt snoozes for a week by comparing
// against Date.now(), so seeding it with "1" reads as "dismissed in 1970" and the banner appears anyway —
// which it did, over the reels, from frame 11 of a film of a reel animation. The two rigs having different
// seeding was the whole bug: the fix went into one of them.
if (process.env.SHOT_SEEN) {
    const setters = process.env.SHOT_SEEN.split(";").map((x) => x.trim()).filter(Boolean).map((entry) => {
        const eq = entry.indexOf("=");
        const key = eq === -1 ? entry : entry.slice(0, eq);
        const raw = eq === -1 ? "1" : entry.slice(eq + 1);
        return `localStorage.setItem(${JSON.stringify(key)}, ${raw === "now" ? "String(Date.now())" : JSON.stringify(raw)});`;
    });
    await send("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { ${setters.join(" ")} } catch (e) {}`,
    });
}
// And the ones a localStorage marker cannot pre-empt, because the server decides they are due. The poll took
// the whole screen one frame after the click on 2026-08-21 and the rig filmed twenty frames of it while
// reporting success — the click landed on the modal, not the button underneath it.
if (process.env.SHOT_HIDE) {
    const sel = process.env.SHOT_HIDE.split(",").map((x) => x.trim()).filter(Boolean).join(", ");
    const css = `${sel} { display: none !important; }`;
    await send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
            // At document-start there may be no head AND no documentElement yet, and .appendChild on null
            // throws — which killed the whole hook before the retry below was ever registered, so
            // SHOT_HIDE silently hid nothing. Same bug as shot.mjs had.
            const put = () => { const root = document.head || document.documentElement;
                if (!root) return;
                const s = document.createElement("style");
                s.textContent = ${JSON.stringify(css)};
                root.appendChild(s); };
            document.addEventListener("DOMContentLoaded", put); put();
            // A modal that mounts after hydration outlives a style added at document-start if the app
            // replaces the head, so re-apply on an interval for the first few seconds too.
            let n = 0; const iv = setInterval(() => { put(); if (++n > 20) clearInterval(iv); }, 200);
        })();`,
    });
}
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

// The scripted player, if there is one. Its return value is printed: a bot that failed to find what it drives
// must say so here rather than producing a film of a page sitting still.
if (EVAL) {
    const out = await evaluate(EVAL);
    console.log(`--eval returned: ${JSON.stringify(out)}`);
}

// WAIT FOR THE MOMENT, rather than guessing at it with a sleep. Polled in the page so the condition is the
// real DOM, and it fails loudly: a film that starts before the thing being filmed is a film of nothing.
if (AWAIT) {
    let seen = false;
    for (let i = 0; i < Math.ceil(AWAIT_MS / 100) && !seen; i += 1) {
        seen = await evaluate(`Boolean(document.querySelector(${JSON.stringify(AWAIT)}))`);
        if (!seen) await sleep(100);
    }
    if (!seen) { chrome.kill(); throw new Error(`${AWAIT} never appeared within ${AWAIT_MS}ms — nothing was filmed`); }
}

// THE TAP. Same retry-and-confirm rule as the click, and the full pointer sequence rather than a bare click,
// because a React onPointerDown handler never sees a click.
if (TAP) {
    let tapped = false;
    for (let i = 0; i < 20 && !tapped; i += 1) {
        tapped = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(TAP)});
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 };
            el.dispatchEvent(new PointerEvent("pointerdown", o));
            el.dispatchEvent(new PointerEvent("pointerup", o));
            el.dispatchEvent(new MouseEvent("click", o));
            return true;
        })()`);
        if (!tapped) await sleep(150);
    }
    if (!tapped) { chrome.kill(); throw new Error(`nothing matched ${TAP} to tap — nothing was filmed`); }
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
