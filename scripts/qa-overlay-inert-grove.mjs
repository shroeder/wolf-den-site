// ── THE SAME PROPERTY, IN THE GROVE ─────────────────────────────────────────────────────────────────────────
// The town's version of this found that three overlays let taps through to the street. The Grove has the same
// shape of surface — GroveScene's root carries onPointerDown={onTapWorld}, which sets the hero's moveTo — and
// the giver's card is rendered over it. So the question has to be asked here too, rather than assumed
// answered because the town's copy is now green.
//
// ⚠️ AND THE GROVE HAS A SECOND HALF THE TOWN DOES NOT. The zone scene has a CLOCK: foes act, food burns,
// things respawn. GroveScene is paused with `paused={zonePanel !== null}`, and the giver is deliberately not
// a zonePanel — so a conversation may be running while the fight continues behind it. That is worth knowing
// either way, so it is reported rather than asserted.
//
//   SHOT_COOKIE=<token> node scripts/qa-overlay-inert-grove.mjs
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;

await requireDevServer(PORT);
const chrome = launchChrome(9361, "qa-overlay-grove-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9361));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };
let fails = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "\u2713" : "\u2717"} ${msg}`); if (!ok) fails += 1; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

const press = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
};

// The hero's own transform is what onTapWorld ultimately moves.
const heroState = () => ev(`(() => {
    const h = document.querySelector(".gv-hero");
    return JSON.stringify({
        hero: h ? (h.style.transform || h.style.left || "") : null,
        kills: document.querySelector(".gv-kills")?.textContent || null,
        foes: document.querySelectorAll(".gv-foe").length,
    });
})()`);

await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
await waitFor(`document.body.classList.contains("gv-full-lock")`, 240);
await ev(`(() => {
    const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[1]?.click();
})()`);
if (!await waitFor(`!!document.querySelector(".gv-npc")`, 160)) {
    console.log("  · no giver in this zone — cannot test"); ws.close(); chrome.kill(); process.exit(1);
}
await sleep(1500);

// Open the conversation with a real pointer press — the NPC's handler is onPointerDown.
const npc = JSON.parse(await ev(`(() => { const r = document.querySelector(".gv-npc").getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }); })()`));
await press(npc.x, npc.y);
if (!await waitFor(`!!document.querySelector(".qd-panel")`, 60)) {
    console.log("  · the giver card never opened"); ws.close(); chrome.kill(); process.exit(1);
}
await sleep(900);

console.log("\n── Grove giver card over a live zone ─────────────────────────");
const before = JSON.parse(await heroState());
const panel = JSON.parse(await ev(`(() => { const r = document.querySelector(".qd-panel").getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }); })()`));
// Tap through the dialogue the way a player does.
for (let k = 0; k < 4; k += 1) { await press(panel.x, panel.y); await sleep(380); }
await sleep(800);
const after = JSON.parse(await heroState());

check(before.hero === after.hero, `the hero does not walk while you talk (${JSON.stringify(before.hero)} -> ${JSON.stringify(after.hero)})`);
check(Boolean(await ev(`!!document.querySelector(".qd-panel")`)), "the card is still open after four taps (they advanced dialogue, not the world)");
console.log(`  · zone clock while talking: kills ${before.kills} -> ${after.kills}, foes ${before.foes} -> ${after.foes}`);

console.log(`\n${fails ? `${fails} FAILURES — the Grove giver leaks taps into the zone` : "the Grove giver makes the zone inert"}`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
