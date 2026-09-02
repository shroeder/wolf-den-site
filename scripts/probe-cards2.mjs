// ── DRIVING THE CAROUSEL, THE STRIKE, AND THE THREE STATES OF A HEALTH BAR ───────────────────────────────────
// The first probe proved a card could be dragged onto a foe and deal damage. This one exists for the things
// that only exist between frames: a swipe walking the hand, a pet crossing the sand, the floor jolting, and a
// bar tweening down rather than snapping. None of those can be checked by looking at a page at rest, so the
// screenshots here are taken ON A CLOCK during the animation rather than after it settles.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_ = process.argv[2];
const OUT = process.argv[3];
const W = Number(process.argv[4] || 412);
const H = Number(process.argv[5] || 780);
const COOKIE = process.env.SHOT_COOKIE;
const PORT = 9457;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: new URL(URL_).hostname, path: "/", secure: false, sameSite: "Lax" });
}
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });
await send("Page.navigate", { url: URL_ });
await sleep(4200);

const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.data, "base64"));
};
const box = async (sel, nth = 0) => evalJs(`(() => { const e = document.querySelectorAll('${sel}')[${nth}]; if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom }; })()`);
const readout = async () => evalJs(`(() => {
    const hp = [...document.querySelectorAll('.cfb-hp')].map((e) => e.textContent.trim());
    const fills = [...document.querySelectorAll('.cfb-fill')].map((e) => e.style.width);
    return { bars: hp, fills, active: [...document.querySelectorAll('.cf-hand .cf-card')].findIndex((e) => e.classList.contains('is-picked')),
             hand: document.querySelectorAll('.cf-hand .cf-card').length,
             guard: [...document.querySelectorAll('.cfb-guard')].map((e) => e.textContent.trim()),
             energy: document.querySelector('.cf-energy')?.textContent?.trim() || null }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });

// ── 0. THE LAYOUT, IN PIXELS ────────────────────────────────────────────────────────────────────────────────
// Three separate times now the fix for one screen size has broken the other: the raised card standing in the
// health bars at 412x780, the whole fighter column sitting 44px INSIDE the hand at 375x441, and the resting
// cards running 33px off the bottom edge. Every one of them looked like a deliberate composition in a
// screenshot and was a collision in the numbers, so the numbers get checked rather than admired.
const layout = await evalJs(`(() => {
    const r = (sel, n = 0) => { const e = document.querySelectorAll(sel)[n]; if (!e) return null;
        const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    return { vh: innerHeight, topbar: r('.cf-top'), heroBar: r('.cf-hero .cfb'), foeBar: r('.cf-foe .cfb', 1),
             sprite: r('.cf-hero .cf-sprite'), rest: r('.cf-hand .cf-card'), raised: r('.cf-hand .cf-card.is-picked') };
})()`);
const checks = [
    ["the raised card clears the health bars", layout.raised.top - layout.heroBar.bottom, (v) => v >= 0],
    ["resting cards are on screen", layout.vh - layout.rest.bottom, (v) => v >= 0],
    ["the fighters clear the top bar", layout.sprite.top - layout.topbar.bottom, (v) => v >= 0],
    ["foe bars sit under their bodies", layout.foeBar.top - layout.sprite.bottom, (v) => v >= 0],
];
let bad = 0;
for (const [what, got, ok] of checks) {
    if (!ok(got)) { bad += 1; console.log(`  FAIL  ${what} — ${got}px`); } else console.log(`  ok    ${what} (${got}px)`);
}
if (bad) { console.log(`LAYOUT  ${bad} collision(s) at ${W}x${H}`); }

// ── 1. AT REST: SOMETHING IS ALREADY BEING READ ─────────────────────────────────────────────────────────────
console.log("OPEN    ", JSON.stringify(await readout()));
await shot("1-open");

// ── 2. THE SWIPE ── sideways across the hand walks the active card; nothing is picked up.
const hand = await box(".cf-hand");
await mouse("mousePressed", hand.x, hand.y);
for (let i = 1; i <= 6; i += 1) { await mouse("mouseMoved", hand.x + i * 16, hand.y); await sleep(28); }
await shot("2-swiped-left");
console.log("SWIPE-L ", JSON.stringify(await readout()));
for (let i = 1; i <= 12; i += 1) { await mouse("mouseMoved", hand.x + 96 - i * 18, hand.y); await sleep(24); }
await mouse("mouseReleased", hand.x - 120, hand.y);
await sleep(140);
await shot("3-swiped-right");
console.log("SWIPE-R ", JSON.stringify(await readout()));

// ── 3. THE LIFT ── straight up out of the hand, onto the middle foe.
// BY NAME, not by position. Picking "the third card" got a Hop on the first run — a block, self-targeting, so
// there was no arrow to photograph and no blow to land, and the probe reported both as missing rather than as
// never asked for. The thing under test is an ATTACK, so the probe has to go and find one.
const card = await evalJs(`(() => { const cards = [...document.querySelectorAll('.cf-hand .cf-card')];
    const i = cards.findIndex((c) => /Bite|Pounce/i.test(c.textContent)); if (i < 0) return null;
    const r = cards[i].getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const foe = await box(".cf-foe", 1);
if (!card || !foe) { console.log("no card/foe", { card, foe }); chrome.kill(); process.exit(1); }
await mouse("mousePressed", card.x, card.y);
await mouse("mouseMoved", card.x, card.y - 30);
await sleep(40);
for (let i = 1; i <= 8; i += 1) {
    await mouse("mouseMoved", card.x + ((foe.x - card.x) * i) / 8, card.y - 30 + ((foe.y - (card.y - 30)) * i) / 8);
    await sleep(35);
}
await sleep(80);
await shot("4-aiming");
// The polygon point count proves the head is part of the ribbon rather than a second shape beside it.
console.log("AIMING  ", JSON.stringify(await evalJs(`({ live: !!document.querySelector('.cf-aim-line.is-live'), lit: !!document.querySelector('.cf-foe.is-target'), pts: document.querySelector('.cf-aim-line')?.getAttribute('points')?.split(' ').length })`)));

const before = await readout();
await mouse("mouseReleased", foe.x, foe.y);

// ── 4. THE BLOW, FRAME BY FRAME ── the pet in flight, the jolt, and the bar on its way down.
for (const ms of [90, 200, 300, 430]) {
    await sleep(ms === 90 ? 90 : 100);
    await shot(`5-strike-${ms}`);
    console.log(`  t+${ms}ms`, JSON.stringify(await evalJs(`({ pet: !!document.querySelector('.cf-strike'), shake: !!document.querySelector('.cf.is-shaking'), fill: document.querySelectorAll('.cfb-fill')[2]?.getBoundingClientRect().width.toFixed(1) })`)));
}
await sleep(600);
await shot("6-landed");
console.log("BEFORE  ", JSON.stringify(before));
console.log("AFTER   ", JSON.stringify(await readout()));

// ── 5. A SHIELDED BAR ── play the block card on yourself and photograph what armour looks like.
const hop = await evalJs(`(() => { const cards = [...document.querySelectorAll('.cf-hand .cf-card')];
    const i = cards.findIndex((c) => /Hop/i.test(c.textContent)); if (i < 0) return null;
    const r = cards[i].getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
if (hop) {
    await mouse("mousePressed", hop.x, hop.y);
    await mouse("mouseReleased", hop.x, hop.y);
    await sleep(120);
    const hero = await box(".cf-hero");
    await mouse("mousePressed", hero.x, hero.y);
    await mouse("mouseReleased", hero.x, hero.y);
    await sleep(700);
    await shot("7-shielded");
    console.log("SHIELD  ", JSON.stringify(await readout()));
} else {
    console.log("SHIELD   no Hop in hand this seed");
}

// ── 6. AND WHAT IT LOOKS LIKE WHEN THE FOES SWING BACK ───────────────────────────────────────────────────────
await evalJs(`document.querySelector('.cf-end')?.click()`);
await sleep(1400);
await shot("8-afterfoe");
console.log("ENDED   ", JSON.stringify(await readout()));

chrome.kill();
process.exit(0);
