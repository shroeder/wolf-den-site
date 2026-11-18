// ── DOES REFRESHING THE GEAR PAGE DUMP YOU AT THE BOTTOM? ───────────────────────────────────────────────────
// Kaishiern, in #bugs 2026-11-11: "Refreshing the character profile page aka the gear page sends me to the
// very bottom of the page."
//
// Nothing in the three components on that page calls scrollIntoView, scrollTo or autoFocus — so this is the
// browser's own scroll restoration landing somewhere wrong, and the only way to know is to do it.
//
// ⚠️ IT RELOADS FROM THE TOP, which is the case in the report. The browser restores the offset it had when
//    the page was left; if the document is SHORT at restore time because the client half has not rendered
//    yet, that offset is clamped to whatever the page is tall at that instant — and then the content lands
//    underneath. Measuring scrollY straight after reload against the document height is the whole test.
//
//   SHOT_COOKIE=<token> node scripts/qa-gear-scroll.mjs
import { mkdirSync, writeFileSync } from "node:fs";

import { attach, launchChrome } from "./lib/qa-chrome.mjs";

const BASE = process.env.BASE || "https://www.wolfdengamingmn.com";
const COOKIE = process.env.SHOT_COOKIE;
const OUT = "scratch/gear-scroll";
if (!COOKIE) { console.error("SHOT_COOKIE required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const chrome = launchChrome(9371, "qa-gear-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9371));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 120) => { for (let k = 0; k < n; k += 1) { if (await ev(x)) return true; await sleep(500); } return false; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: COOKIE, url: BASE, path: "/",
    secure: BASE.startsWith("https"), httpOnly: true, sameSite: "Lax",
});

const url = `${BASE}/marketplace/inventory`;
console.log(`\n${url} on a 430x880 phone\n`);

const metrics = async () => JSON.parse(await ev(`JSON.stringify({
    y: Math.round(window.scrollY),
    h: Math.round(document.documentElement.scrollHeight),
    vh: Math.round(window.innerHeight),
})`) || "{}");

await send("Page.navigate", { url });
const ok = await waitFor(`/gear|equip|inventory|loadout/i.test(document.body.innerText || "")`, 120);
if (!ok) { console.log("✗ the gear page never rendered — is the session good?"); try { chrome.kill(); } catch {} process.exit(2); }
await sleep(4000);

const first = await metrics();
console.log(`  fresh load        y=${first.y}  page height ${first.h}`);

// ⚠️ A RELOAD, NOT A SECOND NAVIGATE. Page.reload is what the member's refresh button does; a fresh
// Page.navigate starts a new history entry and would never restore a scroll position at all — which is
// exactly how you "fail to reproduce" a scroll-restoration bug.
// ⚠️ SCROLLED DOWN FIRST, BECAUSE THAT IS WHAT HE DID. Refreshing from the top can never show a
// restoration bug -- there is nothing to restore. The member was looking at their gear, which is
// most of the way down an 8,000px page.
const target = Math.round(first.h * 0.6);
console.log(`  scrolling to y=${target}, then refreshing…`);
await ev(`window.scrollTo(0, ${target})`);
await sleep(700);
await send("Page.reload", { ignoreCache: false });
await waitFor(`/gear|equip|inventory|loadout/i.test(document.body.innerText || "")`, 120);
await sleep(4000);

const after = await metrics();
const atBottom = after.h - (after.y + after.vh) < 80;
console.log(`  after refresh     y=${after.y}  page height ${after.h}  ${atBottom ? "← AT THE BOTTOM" : ""}`);

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.data) writeFileSync(`${OUT}/after-refresh.png`, Buffer.from(shot.data, "base64"));

console.log("");
if (atBottom && after.y > 400) {
    console.log(`✗ REPRODUCED — refreshing from the top left the page at y=${after.y} of ${after.h}`);
} else if (after.y > 400) {
    console.log(`✗ REPRODUCED — refreshing from the top jumped to y=${after.y}`);
} else {
    console.log(`✓ refreshing from the top stayed at the top (y=${after.y})`);
}
console.log(`  shot ${OUT}/after-refresh.png`);

try { chrome.kill(); } catch { /* gone */ }
process.exit(0);
