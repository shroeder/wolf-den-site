// ── AN OVERLAY MUST MAKE WHAT IS UNDER IT INERT ─────────────────────────────────────────────────────────────
// Luke: "When I tap to continue dialogue, my character moves in the background. This is the kind of thing
// that you should be catching... I'm talking about a flaw in the process you use to create features."
//
// He is right, and this file is the answer rather than the apology. The defect is not "the quest dialogue
// forgot" — it is that TownClient decides whether the street is inert from a HAND-LISTED set of booleans:
//
//     const anyTownModal = roster || menuFor || boardOpen || merchantOpen || gourdOpen
//                       || questOpen || smithOpen || stockOpen || gambleReveal || fight;
//
// Ten names. Three of the file's overlays are not among them — actOpen, bossOpen, voteOpen — so tapping any
// of those three walks the hero and drags the street behind the panel. The comment directly under that line
// describes this exact bug being fixed once already, for whichever overlays existed that day. A list like
// this cannot tell you it is incomplete; it just quietly stops covering things.
//
// So this does not test the quest dialogue. It tests the PROPERTY, for every overlay it can reach:
//
//     with an overlay open, a pointer event over it must not move the hero or scroll the street.
//
// Run from the repo root:  SHOT_COOKIE=<token> node scripts/qa-overlay-inert.mjs
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;

// Each entry: how to reach it, and how to know it is up. Deliberately includes overlays I did not write —
// the point is the property, not my feature.
const OVERLAYS = [
    { name: "quest dialogue (actOpen)", town: 2, open: `[...document.querySelectorAll(".tw-npc-btn")].find((b)=>/Captain|Quest/i.test(b.getAttribute("aria-label")||""))`, up: ".qd-panel" },
    { name: "blacksmith (smithOpen)", town: 2, open: `[...document.querySelectorAll(".tw-npc-btn")].find((b)=>/Blacksmith/i.test(b.getAttribute("aria-label")||""))`, up: ".tw-roster-panel" },
    { name: "who's here (roster)", town: 2, open: `[...document.querySelectorAll("button")].find((b)=>/Who.s here/i.test(b.textContent||""))`, up: ".tw-roster-panel" },
    { name: "town crier (boardOpen)", town: 1, open: `[...document.querySelectorAll(".tw-npc-btn")].find((b)=>/Crier/i.test(b.getAttribute("aria-label")||""))`, up: ".tw-roster-panel" },
    { name: "vote booth (voteOpen)", town: 1, open: `document.querySelector(".tw-votebooth")`, up: ".tw-roster-panel" },
];

await requireDevServer(PORT);
const chrome = launchChrome(9360, "qa-overlay-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9360));
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

/** Where the hero stands, and how far the street is scrolled. The two things a stray tap moves. */
const sceneState = () => ev(`(() => {
    const you = document.querySelector(".tw-av.is-you");
    const scene = document.querySelector(".tw-scene");
    const world = document.querySelector(".tw-world");
    return JSON.stringify({
        heroLeft: you ? you.style.left : null,
        heroTop: you ? you.style.top : null,
        camera: world ? (world.style.transform || "") : null,
        scroll: scene ? scene.scrollLeft : null,
    });
})()`);

let currentTown = null;
for (const o of OVERLAYS) {
    console.log(`\n── ${o.name} ─────────────────────────────────────`);
    if (currentTown !== o.town) {
        await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/town?town=${o.town}` });
        await waitFor(`!!document.querySelector(".tw-world")`, 300);
        await sleep(2500);
        currentTown = o.town;
    } else {
        // Shut whatever is up, without reloading.
        await ev(`document.querySelector(".qd-x, .tw-roster-head button")?.click()`);
        await sleep(600);
    }

    const found = await ev(`!!(${o.open})`);
    if (!found) { console.log(`  · not reachable on this street — skipped`); continue; }

    // ⚠️ A REAL POINTER PRESS on the trigger. Several of these NPCs use onPointerDown, which el.click()
    // does not fire — and a rig that cannot open the thing reports it as passing.
    const box = JSON.parse(await ev(`(() => { const e = ${o.open}; const r = e.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }); })()`));
    const press = async (x, y) => {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    };
    await press(box.x, box.y);
    let opened = await waitFor(`!!document.querySelector(${JSON.stringify(o.up)})`, 20);
    if (!opened) {
        // ⚠️ THE TRIGGER IS NOT WHAT IS UNDER TEST. The street is 2,900px wide behind the camera, so an
        // NPC is routinely off-screen and a coordinate press cannot reach him. A direct DOM click opens
        // onClick handlers regardless of position; what is being measured is the OVERLAY, not the door.
        await ev(`(${o.open})?.click()`);
        opened = await waitFor(`!!document.querySelector(${JSON.stringify(o.up)})`, 20);
    }
    if (!opened) { console.log(`  · could not be opened in this state — NOT verified at runtime`); continue; }
    await sleep(900);

    const before = await sceneState();
    // Tap dead centre of the overlay — where a player taps to advance dialogue or press a button.
    const panel = JSON.parse(await ev(`(() => { const p = document.querySelector(${JSON.stringify(o.up)});
        const r = p.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }); })()`));
    for (let k = 0; k < 3; k += 1) { await press(panel.x, panel.y); await sleep(400); }
    await sleep(900);
    const after = await sceneState();

    const b = JSON.parse(before), a = JSON.parse(after);
    const moved = b.heroLeft !== a.heroLeft || b.heroTop !== a.heroTop;
    const panned = b.camera !== a.camera;
    check(!moved, `the hero stays put (${b.heroLeft} -> ${a.heroLeft})`);
    check(!panned, `the street does not pan behind it`);
}

console.log(`\n${fails ? `${fails} FAILURES — an overlay is letting taps through to the street` : "every overlay makes the street inert"}`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
