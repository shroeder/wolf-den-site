// ── HOW MANY PARTICLES ARE ALIVE WHEN THINGS DIE ────────────────────────────────────────────────────────────
// Luke: "when I kill like more than one thing, the game freaking like lags out and freaking like stutters
// big time."
//
// burst() had no ceiling. A crit spray is 14 nodes, and a multi-kill calls it once per body plus twice more
// per death kit — so one frame could create three to four hundred elements and then write a transform and an
// opacity to each of them every frame for 400ms.
//
// This fights in a zone and samples two things while it does: the live particle count, and the gap between
// animation frames. A stutter IS a long frame; counting nodes alone would not prove it.
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-sparks.mjs
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
await requireDevServer(PORT);
const chrome = launchChrome(9368, "qa-sparks-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9368));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 2000, height: 900, deviceScaleFactor: 1, mobile: true });
// ⚠️ THROTTLED. A desktop CPU hides this entirely; Luke is on a phone. 4x is the setting the decoration
// measurement in ledges-are-painted used, so the two numbers are comparable.
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
await waitFor(`document.body.classList.contains("gv-full-lock")`, 300);
await ev(`(() => { const r = document.querySelectorAll(".ga-atlas .ga-row")[1];
  const c=[...r.querySelectorAll(".ga-card")].filter(x=>!x.classList.contains("ga-town")); c[1]?.click(); })()`);
if (!await waitFor(`!!document.querySelector(".gv-hero")`, 240)) { console.log("did not enter a zone"); process.exit(1); }
await sleep(5000);

await ev(`(() => {
    window.__peak = 0; window.__frames = [];
    let last = performance.now();
    window.__raf = true;
    const tick = () => {
        if (!window.__raf) return;
        const now = performance.now();
        window.__frames.push(now - last); last = now;
        const n = document.querySelectorAll(".gv-spark").length;
        if (n > window.__peak) window.__peak = n;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})()`);

// ⚠️ WALK INTO THEM AND WAIT. Tapping a foe 26 times produced a peak of ZERO particles — the taps were
// targeting, not killing, and the sample measured a quiet scene while reporting on a busy one. The hero
// fights on his own clock once he is next to something, so the rig's job is to put him there and leave it
// alone for long enough that several creatures die together.
for (let i = 0; i < 10; i++) {
    const at = await ev(`(() => {
        const fs = [...document.querySelectorAll(".gv-foe")];
        if (!fs.length) return null;
        const r = fs[Math.min(2, fs.length - 1)].getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    if (at) {
        const p = JSON.parse(at);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    }
    await sleep(3000);
    const seen = await ev(`window.__peak`);
    if (seen > 0 && i > 4) break;
}
await sleep(4000);

const r = JSON.parse(await ev(`(() => {
    window.__raf = false;
    const f = window.__frames.filter((x) => x > 0).sort((a,b) => a-b);
    const pick = (q) => f[Math.floor(f.length * q)] || 0;
    return JSON.stringify({ peakSparks: window.__peak, frames: f.length,
        median: Math.round(pick(0.5)), p95: Math.round(pick(0.95)), worst: Math.round(f[f.length-1] || 0),
        janky: f.filter((x) => x > 50).length });
})()`));
console.log(`\n  peak live particles : ${r.peakSparks}`);
console.log(`  frames sampled      : ${r.frames}  (4x CPU throttle)`);
console.log(`  frame gap median    : ${r.median}ms`);
console.log(`  frame gap p95       : ${r.p95}ms`);
console.log(`  worst frame         : ${r.worst}ms`);
console.log(`  frames over 50ms    : ${r.janky}`);
ws.close(); chrome.kill(); process.exit(0);
