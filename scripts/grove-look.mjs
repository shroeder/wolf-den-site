// ── SHOW ME THE GROVE ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "Can i see it". Photographs the live Grove on a phone — the map, a zone being played, and the
// Coliseum's marshal — rather than describing it.
//
// ⚠️ AGAINST PRODUCTION BY DEFAULT, because the question is what members are looking at right now, not what
// a dev build renders. BASE=http://localhost:3100 points it at a local one.
//
//   SHOT_COOKIE=<token> node scripts/grove-look.mjs
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome } from "./lib/qa-chrome.mjs";

// ⚠️ www, NOT THE APEX. wolfdengamingmn.com 307s to www, and a cookie set host-only on the apex does not
// travel with that redirect -- so the first two runs photographed the SIGNED-OUT marketplace and reported
// "could not open a zone", which reads exactly like a broken Grove.
const BASE = process.env.BASE || "https://www.wolfdengamingmn.com";
const COOKIE = process.env.SHOT_COOKIE;
const OUT = "scratch/grove-look";
if (!COOKIE) { console.error("SHOT_COOKIE required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const chrome = launchChrome(9369, "grove-look-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9369));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 120) => { for (let k = 0; k < n; k += 1) { if (await ev(x)) return true; await sleep(500); } return false; };

let step = 0;
async function shot(name) {
    step += 1;
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r?.data) {
        const f = `${OUT}/${String(step).padStart(2, "0")}-${name}.png`;
        writeFileSync(f, Buffer.from(r.data, "base64"));
        console.log(`  ${f}`);
    }
}
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
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 2, mobile: true });
// ⚠️ SET BY URL, NOT BY DOMAIN, AND secure ON HTTPS. Setting domain alone left the cookie unattached on
// the live host, so /marketplace/grove quietly redirected to the signed-out marketplace and the first run
// photographed a vendor search page.
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: COOKIE, url: BASE, path: "/",
    secure: BASE.startsWith("https"), httpOnly: true, sameSite: "Lax",
});

console.log(`\nphotographing ${BASE}/marketplace/grove on a 430x880 phone\n`);
await send("Page.navigate", { url: `${BASE}/marketplace/grove` });
await waitFor(`!!document.querySelector("[class*='ga-'], [class*='gv-']")`);
await sleep(3500);
// The daily streak card lands on arrival for a returning member; close it so the map is visible.
for (let k = 0; k < 5; k += 1) { if (!(await tap(".gv-pop-x, [aria-label='Close'], [aria-label='close']"))) break; await sleep(700); }
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(1500);
await shot("the-map");

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
for (const c of cards) { await tapAt(c.x, c.y); await sleep(3500); inWorld = await ev(`!!document.querySelector(".gv-world")`); if (inWorld) break; }
if (!inWorld) { console.log("  (could not open a zone)"); try { chrome.kill(); } catch {} process.exit(1); }
await sleep(2000);
await shot("a-zone");

// Play for a few seconds so the shot has a fight in it rather than an empty clearing.
for (let i = 0; i < 24; i += 1) { await tapAt(120 + ((i * 61) % 260), 470 + ((i * 37) % 240)); await sleep(320); }
await sleep(800);
await shot("in-a-fight");

// The menu: where the map, the bar and the Monster Cards live.
if (await tap(".gv-mmenu-handle")) { await sleep(1400); await shot("the-menu"); }

const foes = await ev(`document.querySelectorAll(".gv-foe").length`);
console.log(`\n  creatures on screen in the last shot: ${foes}`);
try { chrome.kill(); } catch { /* gone */ }
process.exit(0);
