// ── THE GROVE QUEST DIALOGUE MUST BE TAPPABLE ──────────────────────────────────────────────────────────────
// Luke: "Clicking npc freezes."
//
// Same sentence as the town, one room over: "when you tap the conversation, you're just locked in the modal
// with the NPC. You can't tap to see the next line. You can't even close the modal." That one was
// QuestDialogue rendered INSIDE .tw-scene, switched off by the scene's own pointer-events guard, and with
// the scene's transform as its containing block so `position: fixed` never reached the viewport.
//
// ⚠️ THE EXISTING GROVE RIG CANNOT SEE THIS BUG CLASS. scripts/qa-quest-grove.mjs opens the giver with a real
// pointer event — correctly — and then advances the conversation with
//
//     document.querySelector(".qd-panel")?.click()
//
// which is a synthetic DOM click: it skips hit-testing entirely, so it lands on the panel no matter what is
// painted over it or what pointer-events resolves to. Every assertion in that file passes while a real finger
// does nothing at all. [[driving-a-browser-with-cdp]] — el.click() is NOT a click. A dialogue that cannot be
// advanced and cannot be closed, over a scene that pauses itself while it is open, IS the freeze.
//
// So this asserts only the things a screenshot and a synthetic click both miss:
//   1. WHERE A TAP LANDS   — elementFromPoint over the panel, the walk button, the dismiss
//   2. WHAT A REAL TAP DOES — Input.dispatchMouseEvent, then: did the line advance, did it close
//   3. THE GEOMETRY        — a fixed overlay trapped in a transformed ancestor covers part of the screen and
//                            looks perfect in a photograph. [[filter-creates-containing-block]]
//
// ⚠️ SAME VIEWPORT AND SAME WAY IN AS qa-quest-grove.mjs (430x880, dsf 1, zone 2). The giver stands at a
// fixed spot in the room and the camera follows the hero, so a different viewport puts him off the right
// edge — at 412x915 his centre measured x=435 in a 412-wide window and every tap "landed on nothing",
// which reads exactly like the bug being tested for.
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-dialogue.mjs
import { execFileSync } from "node:child_process";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
if (!COOKIE) { console.error("SHOT_COOKIE is required — mint one with scripts/_mint-shot-session.mjs"); process.exit(2); }
const setState = (...a) => execFileSync("node", ["scripts/qa-quest-state.mjs", ...a], { encoding: "utf8" }).trim();

await requireDevServer(PORT);
const chrome = launchChrome(9387, "qa-grove-dialogue");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9387));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });

let id = 0; const pending = new Map(); let bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        bad.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
    }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) return "THREW: " + String(r.exceptionDetails.exception?.description || "").split("\n")[0];
    return r?.result?.value;
};
const waitFor = async (x, n = 200) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

// ⚠️ A REAL POINTER EVENT. move → down → up, so onPointerDown fires and the browser hit-tests the
// coordinate the way a finger would.
const tap = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
};
const centreOf = async (sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
        const b = e.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
            w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), left: Math.round(b.left) }); })()`);
    return r && r !== "null" && !String(r).startsWith("THREW") ? JSON.parse(r) : null;
};
// ⚠️ REPORT THE NEAREST MEANINGFUL ANCESTOR, not just the topmost node. A tap on the giver lands on the
// <img> INSIDE his button, which is correct and which a naive check calls a miss.
const hitAt = (x, y) => ev(`(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return "nothing";
    const named = e.closest("[class]") || e;
    const self = (e.tagName.toLowerCase() + "." + [...e.classList].join(".")).replace(/\\.$/, "");
    const owner = (named.tagName.toLowerCase() + "." + [...named.classList].join("."));
    return (self === owner ? self : self + " in " + owner).slice(0, 80); })()`);

let fails = 0; const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails += 1; };
const section = (t) => out.push(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

// A step that has been offered but not taken, so there is a real conversation with a real button on it.
out.push(`  ${setState("grove", "alder", "offer")}`);

await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });

section("getting in front of Warden Alder");
check(await waitFor(`document.body.classList.contains("gv-full-lock")`, 240), "the Grove hydrated");

// ⚠️ .ga-atlas EXISTS BEFORE ITS CARDS DO. The shelf renders as soon as the Grove hydrates and fills in when
// the state arrives, so a click fired on `gv-full-lock` alone lands on an empty row, reports "clicked", and
// nothing happens — which reads exactly like a broken door. Wait for a CARD, not for the page.
check(await waitFor(`document.querySelectorAll(".ga-atlas .ga-card").length > 0`, 120), "the atlas has cards in it");

// ⚠️ AND CLICK IT AGAIN IF IT DID NOT TAKE. React attaches its handlers after the markup is in the DOM, so
// the first click on a freshly-painted card can land on nothing at all.
let entered = "never tried";
let inZone = false;
for (let k = 0; k < 6 && !inZone; k++) {
    entered = await ev(`(() => {
        const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
        if (!row) return "no row";
        const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
        const c = cards[1];
        if (!c) return "no zone 2 card";
        if (c.disabled) return "zone 2 locked";
        c.click();
        return "clicked " + (c.textContent || "").trim().slice(0, 18);
    })()`);
    inZone = await waitFor(`!!document.querySelector(".gv-scene")`, 20);
}
check(inZone, `walked into zone 2 — ${entered}${inZone ? "" : `; note says ${await ev(`document.querySelector(".gv-note")?.textContent || "(nothing)"`)}`}`);
if (!inZone) { console.log(out.join("\n")); console.log(`\nFAIL — ${fails} failing`); ws.close(); chrome.kill(); process.exit(1); }
check(await waitFor(`!!document.querySelector(".gv-npc")`, 120), "the giver is in the room");

// ⚠️ WALK TO HIM FIRST, because the room is wider than the screen. The giver stands at a fixed spot and the
// camera follows the hero, so on a narrow phone his centre measures outside the viewport — elementFromPoint
// answers `nothing` and the rig reports a broken tap that no player could ever have made. Walking to him is
// also what a player does.
const vw = await ev("window.innerWidth"), vh = await ev("window.innerHeight");
let npc = await centreOf(".gv-npc");
for (let k = 0; k < 30; k++) {
    if (npc && npc.x > 24 && npc.x < vw - 24 && npc.y > 24 && npc.y < vh - 24) break;
    await tap(npc && npc.x > vw / 2 ? vw - 24 : 24, Math.round(vh * 0.74));
    await sleep(650);
    npc = await centreOf(".gv-npc");
}
if (!npc) {
    check(false, `the giver is in the room — .gv-npc is not in the DOM. Present: ${await ev(`JSON.stringify({
        scene: !!document.querySelector(".gv-scene"), world: !!document.querySelector(".gv-world"),
        hero: !!document.querySelector(".gv-hero"), npcs: document.querySelectorAll("[class*='npc']").length,
        classes: [...document.querySelectorAll("[class*='npc']")].map(e=>e.className).slice(0,4) })`)}`);
    console.log(out.join("\n")); console.log(`\nFAIL — ${fails} failing`); ws.close(); chrome.kill(); process.exit(1);
}
check(Boolean(npc) && npc.x > 0 && npc.x < vw && npc.y > 0 && npc.y < vh,
    `the giver is inside the ${vw}x${vh} viewport at ${JSON.stringify(npc)}`);
const npcHit = await hitAt(npc.x, npc.y);
check(/gv-npc/.test(String(npcHit)), `a tap aimed at the giver reaches him — lands on ${npcHit}`);
// ⚠️ THE OPEN IS THE PROOF, not the hit-test above. The hit-test is here to say WHY if it fails.

await tap(npc.x, npc.y);
const isOpen = await waitFor(`!!document.querySelector(".qd-panel")`, 40);
check(isOpen, "the conversation opens");
if (!isOpen) { console.log(out.join("\n")); console.log(`\nFAIL — ${fails + 1} failing`); ws.close(); chrome.kill(); process.exit(1); }

section("geometry — does the overlay cover the viewport");
const scrim = await centreOf(".qd-scrim");
check(Boolean(scrim), `scrim box ${JSON.stringify(scrim)} in a ${vw}x${vh} viewport`);
check(Boolean(scrim) && scrim.w >= vw - 1 && scrim.h >= vh - 1,
    `the scrim covers the whole viewport (${scrim?.w}x${scrim?.h} vs ${vw}x${vh})`);

section("pointer-events — is any of it switched off");
for (const sel of [".qd-scrim", ".qd-panel", ".qd-dismiss", ".qd-walk"]) {
    const pe = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
        return e ? getComputedStyle(e).pointerEvents : "absent"; })()`);
    check(pe === "auto", `${sel} pointer-events: ${pe}`);
}

section("hit-testing — where does a tap LAND");
const panel = await centreOf(".qd-panel");
const panelHit = panel ? await hitAt(panel.x, panel.y) : "absent";
check(/qd-/.test(String(panelHit)), `panel centre (${panel?.x},${panel?.y}) hits ${panelHit}`);
const walk = await centreOf(".qd-walk");
const walkHit = walk ? await hitAt(walk.x, walk.y) : "absent";
check(/qd-walk/.test(String(walkHit)), `the walk-away button hits ${walkHit}`);

section("behaviour — what a real tap actually does");
const line1 = await ev(`document.querySelector(".qd-say")?.textContent || ""`);
await tap(panel.x, panel.y); await sleep(900);
const line2 = await ev(`document.querySelector(".qd-say")?.textContent || ""`);
check(String(line1) !== String(line2),
    `a real tap advances or completes the line\n      before: ${JSON.stringify(String(line1).slice(0, 44))}\n      after : ${JSON.stringify(String(line2).slice(0, 44))}`);

// ⚠️ AND THE HERO MUST NOT HAVE WALKED. The scrim exists to swallow the pointer; without it every tap to
// read a line also sets a moveTo underneath. Luke hit exactly this in the town.
const heroBefore = await ev(`document.querySelector(".gv-hero")?.style.transform || ""`);
await tap(panel.x, panel.y); await sleep(600);
const heroAfter = await ev(`document.querySelector(".gv-hero")?.style.transform || ""`);
check(heroBefore === heroAfter, `the hero did not walk while reading (${JSON.stringify(heroBefore)} -> ${JSON.stringify(heroAfter)})`);

section("the way out");
const w2 = await centreOf(".qd-walk");
if (w2) { await tap(w2.x, w2.y); await sleep(1200); }
let closed = !(await ev(`!!document.querySelector(".qd-panel")`));
check(closed, `the walk-away button closes the conversation${w2 ? "" : " (button absent)"}`);
if (!closed) {
    // The scrim's own dismiss, which is the other way a player tries to escape.
    const dis = await centreOf(".qd-dismiss");
    if (dis) { await tap(dis.x, dis.y); await sleep(1200); }
    closed = !(await ev(`!!document.querySelector(".qd-panel")`));
    check(closed, "failing that, the dismiss closes it");
}
check(closed, "there is SOME way out of the conversation");

check(bad.length === 0, `no exceptions${bad.length ? ` — ${bad.slice(0, 2).join(" | ")}` : ""}`);

console.log(out.join("\n"));
console.log(`\n${fails === 0 ? "PASS" : `FAIL — ${fails} failing`}`);
ws.close(); chrome.kill();
process.exit(fails === 0 ? 0 : 1);
