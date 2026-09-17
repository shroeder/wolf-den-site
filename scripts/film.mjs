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
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";
import { installMock, reportMock } from "./lib/shot-mock.mjs";

// ── SHOT_QUIET=1 ── seed every known "already seen this" marker and hide every known scrim, so a shot is of
// the page rather than of whichever launch card this profile has not dismissed yet. See lib/shot-quiet.mjs.
if (process.env.SHOT_QUIET) {
    process.env.SHOT_SEEN = quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";");
    process.env.SHOT_HIDE = quiet(process.env.SHOT_HIDE, QUIET_HIDE, ",");
}

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
// -- AND SOME THINGS CANNOT BE FILMED AFTER THE PAGE HAS LOADED ------------------------------------------------
// --eval runs once the page has settled, which is too late for anything that happens ON MOUNT. The receipt
// screen POSTs its claim the instant it renders and then draws whatever came back, so there is no moment
// after load at which a stub could be installed -- the request is already gone. Filming that screen against a
// $180 haul would otherwise mean redeeming a real claim on a real account and then unpicking a chest, a page,
// a piece of gear and three Creations by hand.
//
// --pre runs at DOCUMENT START, before any of the page's own script, which is where a fetch stub belongs:
//   node scripts/film.mjs "<url>" out/x --pre "window.fetch = async () => new Response(...)"
const PRE = arg("--pre", null);

// ── --mock: DRIVE THE PAGE INTO A STATE WITHOUT TOUCHING THE DATABASE ────────────────────────────────────────
// Writing a state into Neon to look at a screen means mutating a real member's account — so it gets done once,
// carefully, on a live account, and every OTHER state goes unlooked-at. That is how a banner shipped two screens
// below the fold: only one state was ever put in front of a camera, and it was not this one.
//
// Everything these client screens draw arrives over /api/..., so the state can be served at the browser instead:
//   node scripts/film.mjs "<url>" out/x --mock scripts/fixtures/sailing.captain.json
//
// The file is { "<url substring>": <json body> } or { "<substring>": {"status": 500, "json": {...}} }. Anything
// that does not match falls through to the real fetch, so one canned answer can sit inside a live page.
// ⚠️ IT REPORTS WHAT IT SERVED. A fixture whose key never matched is a rig that filmed the real state while
// telling you it filmed yours — the miss list is printed at the end for exactly that reason.
const MOCK = arg("--mock", null);

// ── --fold: IS THE THING ACTUALLY ON THE SCREEN ──────────────────────────────────────────────────────────────
// querySelector finding it and innerText reading right is NOT the same question as a player seeing it. Checked
// with an --eval that read the text, a blocking banner passed while sitting at y=2140 on an 820px screen.
//   node scripts/film.mjs "<url>" out/x --fold ".sail-capblock,.sail-cta"
// Measured at the filmed viewport, before the contact sheet resizes it.
const FOLD = arg("--fold", null);

// ── --fixture: THE SERVER-SIDE HALF OF --mock ────────────────────────────────────────────────────────────────
// These pages render their state on the SERVER and hand it over as a prop, so there is no request for --mock to
// answer. This sets the cookie src/lib/dev-fixture.js reads, which swaps the database for a canned state for
// that one request, in dev only. `--fixture captain` serves scripts/fixtures/.live/<page>.captain.json.
const FIXTURE = arg("--fixture", null);

// ── --touch: TAP LIKE A FINGER, NOT LIKE A SCRIPT ────────────────────────────────────────────────────────────
// `el.click()` and even a full synthetic pointer sequence are DOM events the page dispatches to itself. A real
// touch is different in the one way that matters for a whole class of bug: after `touchend` the BROWSER
// synthesises a click, and it hit-tests that click at dispatch time — so if the handler for the touch removed
// the thing under the finger (closing a sheet, unmounting a portal), the synthesised click lands on whatever
// is now underneath. That is "click-through", and no synthetic event can reproduce it.
//
//   --touch ".equip-slot.slot-off_hand;.gearpick-more;.gearpick-item"
//
// Semicolon-separated selectors, tapped in order via Input.dispatchTouchEvent at each element's centre, with
// --touch-wait ms between them. Requires touch emulation, which is turned on whenever this flag is used.
const TOUCH = arg("--touch", null);
const TOUCH_WAIT = Number(arg("--touch-wait", 900));

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
    // ⚠️ AND THE DISK CACHE IS OFF, FOR THE REASON shot.mjs TURNED IT OFF. Chrome runs against a REUSED
    // profile (--user-data-dir above), so its disk cache survives between runs — and static art under
    // /public is served with max-age=86400. Redraw a sprite, re-film, and you photograph the OLD one.
    //
    // This cost a full debugging round on the Forest: the new whole-tree art was live and byte-correct at the
    // edge, and the film kept showing the redwood trunk-crops it replaced. Every conclusion drawn from those
    // frames was about art that had not existed for an hour. shot.mjs learned this and film.mjs was not told.
    if (TOUCH) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    if (FIXTURE) await send("Network.setCookie", {
        name: "wolfden-fixture", value: FIXTURE, domain: new URL(url).hostname, path: "/",
    });
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(url).hostname, path: "/",
        // ── SECURE, OR PROD SILENTLY SIGNS YOU OUT ───────────────────────────────────────────────────
        // The session cookie is issued with Secure+SameSite=Lax, and a cookie set over CDP without them
        // does not match it — so the request goes out unauthenticated and the rig films the sign-in page
        // while reporting success. Localhost worked because http exempts it, which is exactly why this
        // went unnoticed: every shot that mattered was local. Mirror the real cookie's flags whenever the
        // target is https and the rig can film production too.
        secure: new URL(url).protocol === "https:",
        sameSite: "Lax",
    });
}
//
// `key=value` is supported, and the word `now` means Date.now() — the same as shot.mjs, and for the same
// reason: some markers are TIMESTAMPS rather than flags. The web-push prompt snoozes for a week by comparing
// against Date.now(), so seeding it with "1" reads as "dismissed in 1970" and the banner appears anyway —
// which it did, over the reels, from frame 11 of a film of a reel animation. The two rigs having different
// seeding was the whole bug: the fix went into one of them.
// ⚠️ ONE IMPLEMENTATION, NOT TWO. Both of these hooks used to be COPIED here from shot.mjs, and the note
// directly above says why that is a bug — "the two rigs having different seeding was the whole bug: the fix
// went into one of them". It happened again, in this file, today: the modal-hiding CSS was fixed in
// shot-quiet.mjs to release the scroll lock an announcement modal leaves on `body`, and film.mjs went on
// using its own copy, so the page still could not scroll and a touch tap aimed below the fold hit nothing.
// See [[reuse-the-rule-never-restate-it]]. installQuiet does the seeding AND the hiding for both rigs.
await installQuiet(send, { hide: process.env.SHOT_HIDE, seen: process.env.SHOT_SEEN });
if (MOCK) await installMock(send, JSON.parse(readFileSync(MOCK, "utf8")));
if (PRE) await send("Page.addScriptToEvaluateOnNewDocument", { source: PRE });

await send("Page.navigate", { url });
await sleep(SETTLE);

// awaitPromise so --eval can be an async IIFE: a scripted player that has to WAIT for a screen before it can
// drive it (open the machine, wait for the bonus, then act) is the common case, and without this the rig read
// the value as a pending Promise and reported "{}".
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result?.value;

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

// THE FINGER. Real touch points, one selector at a time, each tap reported with what was under it — because a
// tap that found nothing is a tap that proves nothing, and this flag exists to prove things.
if (TOUCH) {
    for (const sel of TOUCH.split(";").map((x) => x.trim()).filter(Boolean)) {
        let at = null;
        for (let i = 0; i < 20 && !at; i += 1) {
            // ⚠️ SCROLLED INTO VIEW FIRST, AND MEASURED AFTER THE SCROLL HAS LANDED. A touch point below the
            // fold is dispatched at a coordinate the viewport does not contain, so it silently hits nothing —
            // the first run of this tapped an equipment slot at y=869 on an 844px screen and reported success.
            // Measuring in the same tick as the scrollIntoView reads the OLD position, which is the same bug
            // one frame earlier.
            await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
                if (el) el.scrollIntoView({ block: "center", behavior: "instant" }); })()`);
            await sleep(250);
            at = await evaluate(`(() => {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return null;
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return null;
                const y = Math.round(r.top + r.height / 2);
                if (y < 0 || y > window.innerHeight) return null;
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y,
                    what: String(el.className || el.tagName).slice(0, 40) });
            })()`);
            if (!at) await sleep(200);
        }
        if (!at) { chrome.kill(); throw new Error(`nothing tappable matched ${sel} — nothing was filmed`); }
        const { x, y, what } = JSON.parse(at);
        // ⚠️ synthesizeTapGesture, NOT dispatchTouchEvent. Raw touchStart/touchEnd pairs DO reach the page —
        // and Chrome synthesises no click from them, so a tap on a plain <button> does nothing at all. The
        // first cut of this flag reported "touch .gearpick-x at 326,151" and the sheet it was closing stayed
        // open; nothing in that output says "no click was ever produced". synthesizeTapGesture drives the
        // real gesture pipeline, which is the half that turns a tap into a click.
        const mouse = { x, y, button: "left", clickCount: 1, buttons: 1 };
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...mouse, buttons: 0 });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
        await sleep(70);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse, buttons: 0 });
        console.log(`  touch ${sel} at ${x},${y} (${what})`);
        await sleep(TOUCH_WAIT);
    }
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

// ── ON SCREEN, OR MERELY IN THE DOCUMENT ─────────────────────────────────────────────────────────────────────
// The last measurement before the viewport is resized for the sheet. A element that exists, reads right and
// sits below the fold is reported as OFF SCREEN rather than as a pass.
if (FOLD) {
    const rows = await evaluate(`(() => ${JSON.stringify(FOLD)}.split(",").map((sel) => {
        const el = document.querySelector(sel.trim());
        if (!el) return { sel: sel.trim(), found: false };
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return { sel: sel.trim(), found: true, top: Math.round(r.top + window.scrollY), h: Math.round(r.height),
            onScreen: r.top < window.innerHeight && r.bottom > 0 && r.width > 0 && r.height > 0,
            hidden: st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0 };
    }))()`);
    for (const r of rows || []) {
        if (!r.found) console.log(`  fold  ${r.sel.padEnd(24)} NOT IN THE DOCUMENT`);
        else if (r.hidden) console.log(`  fold  ${r.sel.padEnd(24)} in the document but HIDDEN by css`);
        else if (!r.onScreen) console.log(`  fold  ${r.sel.padEnd(24)} OFF SCREEN — y=${r.top} on a ${H}px viewport`);
        else console.log(`  fold  ${r.sel.padEnd(24)} on screen at y=${r.top} (${r.h}px tall)`);
    }
}

// What the fixture actually answered — read HERE, while the filmed page is still the one loaded.
if (MOCK) await reportMock(evaluate);

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
// ⚠️ RESOLVED TO AN ABSOLUTE PATH, BECAUSE A RELATIVE outBase SILENTLY PHOTOGRAPHED A CHROME ERROR PAGE.
// "out/x-sheet.html" became "file:///out/x-sheet.html", a path at the root of the drive that does not
// exist — so the rig reported "44 frames over 2857ms" and handed back a picture of ERR_FILE_NOT_FOUND.
// That is precisely the wrong-picture-that-looks-right this file was written to prevent, committed by
// the file itself.
await send("Page.navigate", { url: `file:///${resolve(sheetPath).replace(/\\/g, "/")}` });
await sleep(1500);
const sheetShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(`${outBase}-sheet.png`, Buffer.from(sheetShot.data, "base64"));

sock.close();
chrome.kill();
console.log(`${frames.length} frames over ${frames[frames.length - 1].at}ms → ${outBase}-sheet.png`);
