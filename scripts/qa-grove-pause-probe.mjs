// ── DOES A PAUSED SCENE STILL CRY "FROZEN"? ─────────────────────────────────────────────────────────────────
// The focused A/B for the 2026-11-14 false alarm. qa-grove-playthrough.mjs found it by accident during three
// minutes of play; this proves it on purpose in about thirty seconds, which is what makes it a check rather
// than a story.
//
// THE BUG: GroveScene's frame returns early while `pausedRef.current` is true — deliberately, so the world
// does not advance while a sheet is up — and that early return sat ABOVE `w.beatAt = now`. The freeze
// watchdog reads beatAt. So opening the menu and reading something for six seconds looked exactly like a
// dead loop and posted "scene loop silent for 7437ms" to the admin phone.
//
// ⚠️ IT HAS TO FAIL ON THE OLD CODE TO BE WORTH ANYTHING. Put the early `return;` back above `w.beatAt`
// in GroveScene and this prints BARKED — that is the check being tested, not trusted.
// [[harness-must-reproduce-the-bug]]
//
//   SHOT_COOKIE=<token> PORT=3100 node scripts/qa-grove-pause-probe.mjs
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const OUT = "scratch/grove-pause";
if (!COOKIE) { console.error("SHOT_COOKIE is required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9367, "qa-pause-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9367));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k += 1) { if (await ev(x)) return true; await sleep(500); } return false; };
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

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.__probe = { barks: [] };
    const realFetch = window.fetch;
    window.fetch = function (...args) {
        try {
            const url = String(args[0] && args[0].url ? args[0].url : args[0] || "");
            if (url.includes("/api/client-error") && args[1] && args[1].body) window.__probe.barks.push(JSON.parse(args[1].body));
        } catch {}
        return realFetch.apply(this, args);
    };`,
});

await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
await waitFor(`!!document.querySelector("[class*='gv-'], [class*='ga-']")`, 240);
await sleep(2500);
for (let k = 0; k < 6; k += 1) { if (!(await tap(".gv-pop-x, [aria-label='Close'], [aria-label='close']"))) break; await sleep(700); }
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(1000);

// Into a zone: an unlocked card that is actually on screen.
const cards = JSON.parse(await ev(`(() => {
    const out = [];
    for (const c of document.querySelectorAll(".ga-card")) {
        if (c.classList.contains("is-locked")) continue;
        const r = c.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
        out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return JSON.stringify(out);
})()`) || "[]");
let inWorld = false;
for (const c of cards) { await tapAt(c.x, c.y); await sleep(3000); inWorld = await ev(`!!document.querySelector(".gv-world")`); if (inWorld) break; }
if (!inWorld) { console.log("✗ never entered a zone — probe means nothing, stopping"); try { chrome.kill(); } catch {} process.exit(1); }
console.log("  in the world");

// ── PAUSE IT. The menu handle opens the drawer; a family in the drawer opens a panel, and a panel is what
// sets `paused`. Both are real pointer events.
const opened = await tap(".gv-mmenu-handle");
console.log(`  menu handle tapped: ${opened}`);
await sleep(1200);
// The drawer's rows are plain buttons inside .gv-mmenu-scroll; the first one is a real destination.
const picked = await ev(`(() => {
    const b = document.querySelectorAll(".gv-mmenu.is-open .gv-mmenu-scroll button");
    const names = [...b].map((x) => (x.innerText || "").replace(/\s+/g, " ").slice(0, 24));
    return JSON.stringify(names);
})()`);
console.log(`  drawer rows: ${picked}`);
await tap(".gv-mmenu.is-open .gv-mmenu-scroll button", 0);
await sleep(1800);
const paused = await ev(`!!document.querySelector(".gv-zsheet, .gv-zsheet-x")`);
console.log(`  a panel is open (scene paused): ${paused}`);
if (!paused) { console.log("✗ could not pause the scene — probe means nothing, stopping"); try { chrome.kill(); } catch {} process.exit(1); }

const r = await send("Page.captureScreenshot", { format: "png" });
if (r?.data) writeFileSync(`${OUT}/paused.png`, Buffer.from(r.data, "base64"));

// ── HOLD IT PAUSED PAST THE WATCHDOG'S 6s THRESHOLD ─────────────────────────────────────────────────────────
console.log("  holding the pause for 12s (the watchdog barks at 6s)...");
await sleep(12000);

const barks = JSON.parse(await ev(`JSON.stringify(window.__probe.barks)`) || "[]");
console.log("");
if (barks.length) {
    console.log(`✗ BARKED — the watchdog reported a freeze that was a PAUSE (${barks.length})`);
    for (const b of barks) console.log(`    ${b.message}  ${b.where}`);
} else {
    console.log("✓ silent — a paused scene is no longer reported as a frozen one");
}
try { chrome.kill(); } catch { /* gone */ }
process.exit(barks.length ? 1 : 0);
