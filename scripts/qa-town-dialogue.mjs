// ── THE TOWN QUEST DIALOGUE MUST BE TAPPABLE ───────────────────────────────────────────────────────────────
// Luke: "when you tap the conversation, you're just locked in the modal with the NPC. You can't tap to see
// the next line. You can't even close the modal."
//
// It was rendered INSIDE .tw-scene, and the scene turns pointer-events off whenever a modal is open so a tap
// on a dialogue cannot also walk the hero. The dialogue was a child of the thing being switched off, so it
// switched itself off: every tap fell through to whatever sat behind it. It also inherited the scene's
// transform as its containing block, so position:fixed resolved to 355x622 inside a 412x915 phone.
//
// ⚠️ NEITHER FAULT IS VISIBLE IN A SCREENSHOT. The modal renders perfectly in both states. What tells them
// apart is where a tap LANDS, so this asserts hit-testing and then the behaviour itself.
//
//   SHOT_COOKIE=<token> node scripts/qa-town-dialogue.mjs
import fs from "node:fs";
import { attach, launchChrome } from "./lib/qa-chrome.mjs";
const COOKIE = process.env.SHOT_COOKIE;
const chrome = launchChrome(9384, "qa-modal2");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9384));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const tap = async (x, y) => { for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "touch" }); };
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.navigate", { url: "http://localhost:3000/marketplace/town?town=1" });
for (let i = 0; i < 40; i++) { if (await ev('document.querySelectorAll(".tw-npc-btn").length > 0')) break; await sleep(500); }
await sleep(3000);
// The street scrolls, so the Ranger is off-screen. Open via his own click handler, then test the thing
// that is actually broken — tapping INSIDE the dialogue — with real pointer events.
let found = false;
for (let i = 0; i < 30; i++) {
  found = await ev(`[...document.querySelectorAll(".tw-npc-btn")].some(x=>/Ranger/i.test(x.getAttribute("aria-label")||""))`);
  if (found) break;
  await sleep(500);
}
console.log("ranger button found:", found, "| all:", await ev(`JSON.stringify([...document.querySelectorAll(".tw-npc-btn")].map(b=>b.getAttribute("aria-label")))`));
await ev(`[...document.querySelectorAll(".tw-npc-btn")].find(x=>/Ranger/i.test(x.getAttribute("aria-label")||""))?.click()`);
await sleep(3000);
console.log("qd-wrap present:", await ev('!!document.querySelector(".qd-wrap")'));
console.log("qd-panel present:", await ev('!!document.querySelector(".qd-panel")'));


// The behaviour Luke reported, end to end: a real tap must advance the line, and the close button must close.
const line1 = await ev('document.querySelector(".qd-panel")?.innerText?.slice(0,70)');
const c = JSON.parse(await ev(`(() => { const r=document.querySelector(".qd-panel").getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}); })()`));
await tap(c.x, c.y); await sleep(1200);
const line2 = await ev('document.querySelector(".qd-panel")?.innerText?.slice(0,70)');
console.log("tap advanced the line:", line1 !== line2);
console.log("   before:", JSON.stringify(line1));
console.log("   after :", JSON.stringify(line2));
const xr = JSON.parse(await ev(`(() => { const r=document.querySelector(".qd-x").getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}); })()`));
await tap(xr.x, xr.y); await sleep(1200);
console.log("close button closed it:", !(await ev('!!document.querySelector(".qd-wrap")')));
const s = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".promo/town-modal.png", Buffer.from(s.data, "base64"));
console.log("shot .promo/town-modal.png");
ws.close(); chrome.kill();
