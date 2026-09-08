// ── DOES THE LAST CARD OF A TURN SURVIVE PRESSING "END TURN"? ────────────────────────────────────────────────
// An attack in this game deliberately holds its result back until the animal lands (IMPACT_MS in
// CardFightClient) so the number, the bar and the jolt arrive together. That hold is a window in which the
// screen's `fight` is one card behind — and everything that advanced the fight used to compute its next state
// from that value and then write a whole snapshot back. Two decisions inside the window both start from the
// same base and the later write erases the earlier one.
//
// Playing the last card of a turn and immediately ending it is not a mis-tap; it is how the game is played.
// So this measures exactly that: same seed, same card, same foe, twice — once ending the turn straight after
// the release, once waiting for the impact to land. The two must take the SAME health off the foe.
//
//   node scripts/cards-race.mjs                  both runs, and the verdict
//   node scripts/cards-race.mjs --gap 40         how long after release to press End turn (ms)
//
// It plays a bare ?seed= fight, which has no run behind it — nothing here can touch the owner's ladder.
import { spawn } from "node:child_process";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:3000/marketplace/cards");
const SEED = arg("--seed", "4242");
const GAP = Number(arg("--gap", 0));
const PORT = Number(arg("--port", 9481));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-race-${PORT}`, "about:blank",
], { stdio: "ignore" });

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
let msgId = 0;
const pending = new Map();
sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
    const i = ++msgId; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params }));
});
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
// ⚠️ THE CARD GAME IS OWNER-GATED, so without the session cookie this loads a 307 and measures an empty page
// — which is exactly what "no attack card in the opening hand" meant the first time it was run.
if (!process.env.SHOT_COOKIE) throw new Error("set SHOT_COOKIE — the card game will not render without it");
await send("Network.enable");
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
    domain: new URL(BASE).hostname, path: "/", secure: false, sameSite: "Lax",
});
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });

const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse",
});
const boxOf = (sel, nth = 0) => js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if (!e) return null; const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

// The whole fight in numbers, read off the screen the way a player reads it.
const board = () => js(`(() => ({
    energy: document.querySelector('.cf-energy-n')?.textContent?.trim() || null,
    turn: document.querySelector('.cf-turn')?.textContent?.trim() || null,
    foes: [...document.querySelectorAll('.cf-foe .cfb-hp')].map((e) => e.textContent.trim()),
    hand: [...document.querySelectorAll('.cf-hand .cf-card')].map((c) => ({
        name: c.querySelector('.cf-banner')?.textContent?.trim() || null,
        text: c.querySelector('.cf-text')?.textContent?.trim() || null,
    })),
}))()`);

const hpOf = (s) => Number(String(s || "").split("/")[0]) || 0;

// ── ONE TRIAL ────────────────────────────────────────────────────────────────────────────────────────────
// Loads the fight fresh so both trials start from an identical board, finds the first card in hand that deals
// damage, throws it at foe 0, and presses End turn `gap` ms after letting go.
async function trial(gap) {
    await send("Page.navigate", { url: `${BASE}?seed=${SEED}` });
    for (let i = 0; i < 60; i += 1) { await sleep(250); if (await js(`!!document.querySelector('.cf-hand .cf-card')`)) break; }
    await sleep(600);

    const before = await board();
    const idx = before.hand.findIndex((c) => /damage/i.test(c.text || ""));
    if (idx < 0) throw new Error("no attack card in the opening hand: " + JSON.stringify(before));

    const a = await boxOf(".cf-hand .cf-card", idx);
    const b = await boxOf(".cf-foe", 0);
    if (!a || !b) throw new Error("could not find the card or the foe");

    await mouse("mousePressed", a.x, a.y);
    for (let i = 1; i <= 8; i += 1) {
        await mouse("mouseMoved", a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
        await sleep(30);
    }
    await mouse("mouseReleased", b.x, b.y);

    if (gap) await sleep(gap);
    const end = await boxOf(".cf-end");
    await mouse("mousePressed", end.x, end.y);
    await sleep(40);
    await mouse("mouseReleased", end.x, end.y);

    // Long enough for the whole party's beats to walk and the turn to come back round.
    await sleep(4000);
    const after = await board();
    return {
        card: before.hand[idx].name, text: before.hand[idx].text,
        foeBefore: hpOf(before.foes[0]), foeAfter: hpOf(after.foes[0]),
        dealt: hpOf(before.foes[0]) - hpOf(after.foes[0]),
    };
}

console.log(`seed ${SEED} — the same card, the same foe, twice.\n`);
const fast = await trial(GAP);
const slow = await trial(900);

for (const [label, r] of [[`End turn ${GAP}ms after release`, fast], ["End turn after the impact lands", slow]]) {
    console.log(`  ${label}`);
    console.log(`    ${r.card} — ${r.text}`);
    console.log(`    foe ${r.foeBefore} → ${r.foeAfter}   (${r.dealt} taken off)\n`);
}

sock.close();
chrome.kill();
if (fast.dealt !== slow.dealt) {
    console.log(`✗ THE CARD IS BEING EATEN. Ending the turn ${GAP}ms after the throw took ${slow.dealt - fast.dealt}`
        + ` less health off the foe than waiting did — the same card, played the same way.`);
    process.exit(1);
}
console.log(`✓ both took ${fast.dealt} off. The last card of a turn survives ending it.`);
