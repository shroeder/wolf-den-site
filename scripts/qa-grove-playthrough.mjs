// ── PLAY THE GROVE FOR A WHILE AND CATCH THE FREEZE IN THE ACT ──────────────────────────────────────────────
// Luke, 2026-11-14, twenty minutes after the Grove opened to everybody and the first member through the door
// filed three "scene loop silent" reports: "Play through it and fix issues."
//
// ⚠️ WHY THIS IS NOT qa-grove-coliseum.mjs AGAIN. That rig plays ONE run and photographs what the screen
// says. This one is looking for a stall — a thing that happens somewhere in a few minutes of ordinary play,
// not at a known moment — so it has to play continuously and be watching the whole time.
//
// Three instruments, because a freeze that leaves no trace is the entire problem:
//
//   1. AN INDEPENDENT HEARTBEAT. A setInterval watching its own requestAnimationFrame, with a 1200ms
//      threshold rather than the shipped watchdog's 6000ms — the shipped one is tuned to report a disaster
//      to a phone, and this is tuned to catch the first hitch that leads to one.
//   2. THE SHIPPED WATCHDOG'S OWN PAYLOAD, read by hooking fetch. It assembles exactly the state worth
//      having (zone, wave, foes, pops, hit-stop, overlay) and until today the server threw it away.
//   3. ⚠️ A CPU PROFILE. This is the one that actually answers the question. A stall is a main thread that
//      did not come back, so the profiler's self-time by function NAMES the cause instead of describing the
//      symptom. [[look-at-it-before-theorising]]
//
//   SHOT_COOKIE=<token> PORT=3100 node scripts/qa-grove-playthrough.mjs [seconds]
//
// ⚠️ IT PLAYS ON A REAL ACCOUNT and settles real kills. That is the point — a mocked scene cannot stall the
// way the real one does — but it means the account it names below actually gains progress.
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const SECONDS = Number(process.argv[2] || 150);
const OUT = process.env.OUT || "scratch/grove-play";
if (!COOKIE) { console.error("SHOT_COOKIE is required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9366, "qa-play-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9366));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map(); const bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        const d = String(m.params.exceptionDetails?.exception?.description || "");
        if (!/ChunkLoadError|hmr-client|Failed to fetch/.test(d)) bad.push("EXCEPTION " + d.split("\n")[0]);
    }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k += 1) { if (await ev(x)) return true; await sleep(500); } return false; };

let step = 0;
async function shot(name) {
    step += 1;
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r?.data) {
        const f = `${OUT}/${String(step).padStart(2, "0")}-${name}.png`;
        writeFileSync(f, Buffer.from(r.data, "base64"));
        console.log(`     shot ${f}`);
    }
}

// ⚠️ A REAL POINTER, NOT element.click(). Everything in this scene is onPointerDown; .click() dispatches a
// click and no pointer events at all, so a rig using it taps nothing while reporting success.
// [[driving-a-browser-with-cdp]]
async function tapAt(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
}
async function tap(sel, nth = 0) {
    const at = await ev(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    if (!at) return false;
    const { x, y } = JSON.parse(at);
    await tapAt(x, y);
    return true;
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Profiler.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

// ── THE INSTRUMENTS, INSTALLED BEFORE ANY SCRIPT ON THE PAGE RUNS ───────────────────────────────────────────
await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.__play = { stalls: [], barks: [], settles: [], longTasks: [], frames: 0, worst: 0 };

    // 1. Our own heartbeat. Deliberately tighter than the shipped 6s watchdog.
    (function heartbeat() {
        let last = performance.now();
        const tick = () => {
            const now = performance.now();
            const gap = now - last;
            window.__play.frames += 1;
            if (gap > window.__play.worst) window.__play.worst = Math.round(gap);
            // 1200ms is ~70 dropped frames. Nothing in a healthy loop comes near it.
            if (gap > 1200) {
                window.__play.stalls.push({ at: Math.round(now), gapMs: Math.round(gap),
                    foes: document.querySelectorAll(".gv-foe").length,
                    pops: document.querySelectorAll(".gv-pop").length,
                    overlay: Boolean(document.querySelector(".gv-pop, .gv-ask")) });
            }
            last = now;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    })();

    // 2. ⚠️ THE SHIPPED WATCHDOG'S OWN PAYLOAD. Until today /api/client-error discarded \`where\`, which is
    //    the only reason the three live reports are undiagnosable. Read it here at the source.
    //    Settles are captured too: a stall that lands on a settle is a different bug from one that does not.
    const realFetch = window.fetch;
    window.fetch = function (...args) {
        try {
            const url = String(args[0] && args[0].url ? args[0].url : args[0] || "");
            const body = args[1] && args[1].body;
            if (url.includes("/api/client-error") && body) window.__play.barks.push(JSON.parse(body));
            if (url.includes("/grove") && args[1] && args[1].method === "POST") {
                window.__play.settles.push({ at: Math.round(performance.now()), url: url.slice(-60) });
            }
        } catch {}
        return realFetch.apply(this, args);
    };

    // 3. Long tasks, as a cheap cross-check on the profile.
    try {
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (e.duration > 400) window.__play.longTasks.push(Math.round(e.duration));
        }).observe({ entryTypes: ["longtask"] });
    } catch {}
    `,
});

console.log(`\nplaying as the SHOT_COOKIE account for ${SECONDS}s on a 430x880 phone\n`);
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });

// ⚠️ WAITING FOR THE ELEMENT IS NOT WAITING FOR HYDRATION. A server-rendered card is in the document long
// before React has attached a single handler, and a tap in that window does nothing at all.
const ready = await waitFor(`!!document.querySelector(".gv-zone, .gv-world, [class*='gv-']")`, 240);
console.log(`  grove page: ${ready ? "loaded" : "NEVER LOADED"}`);
if (!ready) { console.log(await ev(`document.body.innerText.slice(0,400)`)); process.exit(1); }
await sleep(2500);
await shot("hub");

// ── ⚠️ DISMISS WHAT IS COVERING THE HUB FIRST ───────────────────────────────────────────────────────────────
// The first run of this rig tapped 417 times over 150 seconds, reported ZERO stalls, and was tapping the
// DAILY STREAK MODAL the whole time — "Welcome back! Day 7", a full-screen card that lands on arrival for any
// returning member. 94% idle, zero foes, and a clean bill of health for a game it never entered.
// [[harness-must-reproduce-the-bug]]
for (let k = 0; k < 6; k += 1) {
    const closed = await tap(".gv-pop-x, .modal-x, [aria-label='Close'], [aria-label='close']")
        || await tap("button.x, .x-btn");
    if (!closed) break;
    await sleep(700);
}
// Whatever is left that covers the screen, press Escape at it.
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(1200);
await shot("hub-clear");

// ── WALK INTO A ZONE ────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE CELL HAS TO BE UNLOCKED *AND* ON SCREEN. The atlas is a stack of horizontally scrolled rows, so most
// `.ga-cell`s sit outside the viewport — and tapping the centre of an off-screen rect sends the click to
// whatever happens to be at those coordinates instead. The second run of this rig tapped ten cells and
// entered nothing for exactly that reason. `.ga-card` without `.is-locked`, clipped to the viewport.
const pickable = await ev(`(() => {
    const out = [];
    for (const c of document.querySelectorAll(".ga-card")) {
        if (c.classList.contains("is-locked")) continue;
        const r = c.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
        out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
                   label: (c.innerText || "").replace(/\s+/g, " ").slice(0, 40) });
    }
    return JSON.stringify(out);
})()`);
const cards = JSON.parse(pickable || "[]");
console.log(`  unlocked cards on screen: ${cards.length}`);
let entered = false;
for (const c of cards) {
    console.log(`     tapping "${c.label}"`);
    await tapAt(c.x, c.y);
    await sleep(3000);
    entered = await ev(`!!document.querySelector(".gv-world")`);
    if (entered) { console.log(`     -> entered`); break; }
}
console.log(`  in the world: ${entered}`);
await shot("zone");

// ⚠️ A RIG THAT CANNOT GET IN MUST SAY SO AND STOP, not play the menu for three minutes and report health.
if (!entered) {
    console.log("");
    console.log("✗ NEVER ENTERED A ZONE — nothing below would mean anything. Stopping.");
    console.log(await ev(`document.body.innerText.replace(/\s+/g,' ').slice(0,500)`));
    try { chrome.kill(); } catch { /* gone */ }
    process.exit(1);
}

await send("Profiler.setSamplingInterval", { interval: 1000 });
await send("Profiler.start");

// ── PLAY ────────────────────────────────────────────────────────────────────────────────────────────────────
// A tap every ~350ms across the lower half of the screen, which is how the game is actually played: the hero
// walks to where you tap and auto-attacks whatever comes into reach.
const t0 = Date.now();
let taps = 0;
while ((Date.now() - t0) / 1000 < SECONDS) {
    const x = 60 + Math.floor(((taps * 97) % 300));
    const y = 430 + Math.floor(((taps * 53) % 330));
    await tapAt(x, y);
    taps += 1;
    await sleep(350);
    if (taps % 60 === 0) {
        const s = await ev(`JSON.stringify({ stalls: __play.stalls.length, worst: __play.worst, barks: __play.barks.length, foes: document.querySelectorAll('.gv-foe').length })`);
        console.log(`   ${Math.round((Date.now() - t0) / 1000)}s  ${s}`);
    }
}

const prof = await send("Profiler.stop");
await shot("after-play");

// ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────────────────
const res = JSON.parse(await ev(`JSON.stringify(window.__play)`) || "{}");
console.log(`\n── ${taps} taps over ${SECONDS}s ───────────────────────────────`);
console.log(`frames:        ${res.frames}`);
console.log(`worst gap:     ${res.worst}ms`);
console.log(`stalls >1.2s:  ${res.stalls?.length || 0}`);
for (const s of (res.stalls || []).slice(0, 12)) console.log(`   ${s.gapMs}ms  foes=${s.foes} pops=${s.pops} overlay=${s.overlay}`);
console.log(`long tasks >400ms: ${(res.longTasks || []).join(", ") || "none"}`);
console.log(`shipped watchdog fired: ${res.barks?.length || 0}`);
for (const b of res.barks || []) console.log(`   ${b.message}  ${b.where}`);
if (bad.length) console.log(`\nexceptions:\n  ${bad.slice(0, 8).join("\n  ")}`);

// ── THE PROFILE: SELF TIME BY FUNCTION ──────────────────────────────────────────────────────────────────────
// ⚠️ SELF time, not total. Total time blames whatever is at the top of the stack — which for a game loop is
// always the loop — and tells you nothing. Self time names the function that was actually executing.
const p = prof?.profile;
if (p?.nodes) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dt = p.timeDeltas || []; const samples = p.samples || [];
    for (let i = 0; i < samples.length; i += 1) {
        const n = byId.get(samples[i]);
        if (!n) continue;
        const f = n.callFrame;
        const key = `${f.functionName || "(anonymous)"}  ${String(f.url || "").split("/").pop()}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) || 0) + (dt[i] || 0));
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
    const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
    console.log(`\n── CPU profile, self time (${Math.round(total / 1000)}ms sampled) ──────────────`);
    for (const [k, us] of top) {
        const pct = (us / total) * 100;
        if (pct < 0.4) continue;
        console.log(`  ${String(Math.round(us / 1000)).padStart(6)}ms  ${pct.toFixed(1).padStart(5)}%  ${k}`);
    }
    writeFileSync(`${OUT}/profile.cpuprofile`, JSON.stringify(p));
    console.log(`\n  full profile: ${OUT}/profile.cpuprofile`);
}

try { chrome.kill(); } catch { /* already gone */ }
process.exit(0);
