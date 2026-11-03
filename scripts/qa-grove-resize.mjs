// ── THE SCENE MUST STILL RESCALE WHEN THE SCREEN CHANGES SHAPE ─────────────────────────────────────────────
// The frame loop no longer reads host.clientWidth — those four reads a frame were forcing a full layout of
// the scene mid-frame and were the single biggest cost in the Grove (3687 + 763 profiler samples, gone).
// The size is cached and refreshed by a ResizeObserver instead.
//
// ⚠️ THAT TRADE HAS ONE FAILURE MODE AND IT IS INVISIBLE UNTIL IT MATTERS. If the observer does not fire,
// everything looks perfect — until a player rotates their phone, or the address bar collapses, and the whole
// world stays rendered at the old scale: bodies the wrong size, standing off the ground, camera clamped to a
// width that no longer exists. Nothing errors. check:grove cannot see it either, because it loads a FRESH
// PAGE at each size rather than resizing a live one, so it would pass with a cache that never updates.
//
// So this resizes a scene that is already running and checks the world actually followed.
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-resize.mjs
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;

if (!COOKIE) { console.log("no SHOT_COOKIE — mint one with scripts/_mint-shot-session.mjs"); process.exit(1); }
await requireDevServer(PORT);
const chrome = launchChrome(9374, "qa-resize-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9374));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

let fails = 0;
const check = (ok, m) => { console.log(`  ${ok ? "✓" : "✗"} ${m}`); if (!ok) fails += 1; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 820, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
if (!await waitFor(`document.body.classList.contains("gv-full-lock")`, 240)) { console.log("never reached the Grove"); process.exit(1); }
await ev(`(() => {
    const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[1]?.click();
})()`);
if (!await waitFor(`!!document.querySelector(".gv-hero")`, 200)) { console.log("never entered a zone"); process.exit(1); }
await sleep(3000);

// --gv-unit is the scale everything in the world is sized off, and the hero's painted height is what the
// player actually sees. Both have to move, or only half the scene followed the resize.
const probe = async () => JSON.parse(await ev(`(() => {
    const host = document.querySelector(".gv-scene") || document.querySelector(".gv-host") || document.body;
    const hero = document.querySelector(".gv-hero");
    const unit = parseFloat(getComputedStyle(host).getPropertyValue("--gv-unit")) || null;
    const r = hero ? hero.getBoundingClientRect() : null;
    return JSON.stringify({ unit, heroH: r ? Math.round(r.height) : null, vw: innerWidth, vh: innerHeight });
})()`) || "null");

const sizes = [
    [900, 820, "starting size"],
    [1800, 820, "twice as wide, like turning the phone"],
    [700, 900, "narrow and tall again"],
];
const seen = [];
for (const [w, h, label] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    // A ResizeObserver delivers on the frame AFTER layout, and the scene then needs a frame to use it.
    await sleep(1400);
    const p = await probe();
    seen.push({ ...p, label });
    console.log(`  ${String(w + "x" + h).padEnd(10)} ${String(label).padEnd(38)} --gv-unit ${String(p.unit).padStart(7)}   hero ${String(p.heroH).padStart(4)}px`);
}

console.log("");
const [a, b, c] = seen;
check(a.unit && b.unit && c.unit, "the scene reports a unit scale at every size");
// The world is sized off the viewport, so doubling the width must move the scale. If the cache never
// refreshed, these would be identical to the first reading -- which is the whole point of this test.
check(b.unit !== a.unit, `widening the viewport changed the world scale (${a.unit} -> ${b.unit})`);
check(c.unit !== b.unit, `narrowing it again changed the scale back (${b.unit} -> ${c.unit})`);
check(b.heroH !== a.heroH, `the hero is actually drawn at the new scale (${a.heroH}px -> ${b.heroH}px)`);
// And back to the start: a cache that updates but drifts is just a slower bug.
const again = await (async () => {
    await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 820, deviceScaleFactor: 1, mobile: true });
    await sleep(1400);
    return probe();
})();
check(Math.abs((again.unit || 0) - (a.unit || 0)) < 0.01,
    `returning to the first size restores the first scale (${a.unit} vs ${again.unit})`);

console.log(fails ? `\n${fails} FAILURES — the cached host size is not following the screen` : `\nthe scene follows the screen; the cached size refreshes.`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
