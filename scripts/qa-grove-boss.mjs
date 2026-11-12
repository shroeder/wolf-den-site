// ── KILL A BOSS AND SEE WHETHER THE KILL CARD SAYS ANYTHING ─────────────────────────────────────────────────
// The fourth silent moment. `bossWon` was set in three places in GroveClient and read in NONE, so the boss
// kill — the only source of a Monster Card, the thing that opens the next zone — announced nothing, while two
// comments in groveBoss described the card that was supposed to show the emblem and the hyper sliver.
//
// It is wired now, and this is the half that reading cannot do: whether the card actually appears, whether it
// names what the server paid, and whether it collides with the new-area pop that fires on the same kill.
//
// ⚠️ A READING, NOT A GATE, and it kills a real boss on Luke's own account (a 30-minute cooldown per zone,
// an emblem roll, some xp). Zone 2 is the default because it is long cleared — 977 kills against 50 needed.
//
//   SHOT_COOKIE=<token> PORT=3100 node scripts/qa-grove-boss.mjs ["Mossy Hollow"]
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const ZONE_NAME = process.argv[2] || process.env.ZONE || "Mossy Hollow";
const OUT = process.env.OUT || "scratch/coliseum";
if (!COOKIE) { console.error("SHOT_COOKIE is required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9362, "qa-boss-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9362));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map(); const bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        const d = String(m.params.exceptionDetails?.exception?.description || "");
        if (!/ChunkLoadError|hmr-client|Failed to fetch/.test(d)) bad.push("EXCEPTION " + d.split("\n")[0]);
    }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k += 1) { if (await ev(x)) return true; await sleep(500); } return false; };
let step = 0;
async function shot(name) {
    step += 1;
    const tag = `b${String(step).padStart(2, "0")}-${name}`;
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r?.data) { writeFileSync(`${OUT}/${tag}.png`, Buffer.from(r.data, "base64")); console.log(`     shot ${OUT}/${tag}.png`); }
}
// A real pointerdown — the foes are onPointerDown and .click() would do nothing at all.
async function tap(sel, nth = 0) {
    const at = await ev(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 1) return null;
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    if (!at) return false;
    const { x, y } = JSON.parse(at);
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "mouse" });
    }
    return true;
}
let fails = 0;
const check = (ok, msg, extra = "") => { console.log(`  ${ok ? "✓" : "✗"} ${msg}${extra ? `  ${extra}` : ""}`); if (!ok) fails += 1; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__enter = null; window.__boss = null;
    const orig = window.fetch;
    window.fetch = async (...a) => {
        const r = await orig(...a);
        try {
            const u = String(a[0]);
            if (u.includes("/api/marketplace/grove")) {
                const j = await r.clone().json();
                if (j && j.zone && j.seed) window.__enter = j;
                if (j && j.boss) window.__boss = j;
            }
        } catch {}
        return r;
    };
` });

console.log(`\nWALKING INTO ${ZONE_NAME.toUpperCase()}`);
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
check(await waitFor(`document.body.classList.contains("gv-full-lock")`, 240), "the Grove loaded");
await sleep(1500);
const entered = await ev(`(() => {
    const cards = [...document.querySelectorAll(".ga-card")];
    const card = cards.find((c) => (c.textContent || "").includes(${JSON.stringify(ZONE_NAME)}));
    if (!card) return "not found";
    card.click();
    return "clicked";
})()`);
check(entered === "clicked", "found the zone card", String(entered));
await waitFor(`!!window.__enter`, 80);
await sleep(2500);

// ── IS THE BOSS EVEN STANDING THERE ─────────────────────────────────────────────────────────────────────────
// It spawns from a LIVE kill count against zone.toUnlock, with the server's 30-minute cooldown. A zone long
// past its requirement should have one on the floor the moment the world builds.
const bossUp = await waitFor(`document.querySelectorAll(".gv-foe.is-boss").length > 0`, 30);
check(bossUp, "the boss is standing in the zone");
if (!bossUp) {
    const z = await ev(`JSON.stringify({ kills: window.__enter?.zone?.kills, need: window.__enter?.zone?.toUnlock, wait: window.__enter?.zone?.bossWaitMs })`);
    console.log(`     zone says ${z} — a non-zero wait is the 30-minute cooldown, not a bug`);
    await shot("noboss");
    process.exit(fails ? 1 : 0);
}
await shot("boss");

// -- WALK TO IT FIRST. A GROVE ZONE IS SEVERAL SCREENS WIDE --------------------------------------------------
// The first run of this tapped `.gv-foe.is-boss` 440 times and never touched it: the boss stands out near the
// far gate, which is off-screen on a 430px phone, so every tap was dispatched at a coordinate outside the
// viewport and landed on nothing. The element being in the DOM is not the element being on the glass.
//
// Holding a press near the right edge is how a player walks -- onTapWorld sets moveTo and the hold keeps
// feeding it, but ONLY while there is no target, which is why the press has to follow a ground tap rather
// than a foe tap.
async function walkRight(ms) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 410, y: 700, button: "left", clickCount: 1, pointerType: "mouse" });
    const until = Date.now() + ms;
    while (Date.now() < until) {
        // The hold is re-read from the last pointermove, so it has to keep moving or the walk is one frame.
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 410, y: 700, button: "left", pointerType: "mouse" });
        await sleep(120);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 410, y: 700, button: "left", clickCount: 1, pointerType: "mouse" });
}
const bossOnGlass = () => ev(`(() => {
    const b = document.querySelector(".gv-foe.is-boss");
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.right > 8 && r.left < window.innerWidth - 8;
})()`);

console.log("\nWALKING OUT TO IT");
let walked = 0;
while (walked < 60000 && !(await bossOnGlass())) {
    await walkRight(2500);
    walked += 2500;
}
check(await bossOnGlass(), "the boss is on screen", `walked ${walked / 1000}s`);
await shot("approach");

console.log("\nFIGHTING IT");
const began = Date.now();
let taps = 0;
while (Date.now() - began < 180000) {
    if (await ev(`!!document.querySelector(".gv-pop")`)) break;
    if (await bossOnGlass()) {
        await tap(".gv-foe.is-boss"); taps += 1;
    } else if (await ev(`document.querySelectorAll(".gv-foe").length > 0`)) {
        // Something is in the way, or the camera drifted off it -- clear the path and walk back on.
        await tap(".gv-foe"); taps += 1;
        if (taps % 12 === 0) await walkRight(1500);
    } else {
        await walkRight(1500);
    }
    await sleep(Number(process.env.TAP_MS || 400));
}
console.log(`     ${taps} taps, ${Math.round((Date.now() - began) / 1000)}s`);

console.log("\nWHAT THE KILL SAID");
const up = await waitFor(`!!document.querySelector(".gv-pop")`, 30);
check(up, "a card came up on the kill");
const cardText = await ev(`(document.querySelector(".gv-pop")?.innerText || "").replace(/\\s+/g, " ").trim()`);
console.log(`     card: ${JSON.stringify(cardText)}`);
const paid = JSON.parse(await ev(`JSON.stringify(window.__boss && { boss: window.__boss.boss?.name, emblem: window.__boss.emblem, xp: window.__boss.xp, hyper: window.__boss.hyper?.name || null, first: window.__boss.first, kills: window.__boss.kills, unlocked: window.__boss.unlocked?.name || null })`) || "null");
console.log(`     server paid: ${JSON.stringify(paid)}`);
if (paid) {
    check(String(cardText).includes(paid.boss), "it names the creature", `server said ${paid.boss}`);
    if (paid.xp > 0) check(String(cardText).includes(String(paid.xp)), "and the xp it paid", `server said ${paid.xp}`);
    if (paid.hyper) check(String(cardText).includes(paid.hyper), "and the hyper sliver", `server said ${paid.hyper}`);
}
// ⚠️ ONE CARD, NOT TWO. A first clear sets the kill card AND the new-area pop, both .gv-pop fixed layers.
check((await ev(`document.querySelectorAll(".gv-pop").length`)) === 1, "exactly one card is on screen",
    `${await ev(`document.querySelectorAll(".gv-pop").length`)} drawn`);
// And the scene's own Monster Card reveal must not ghost through it.
check((await ev(`(() => { const m = document.querySelector(".gv-mc"); return !m || getComputedStyle(m).opacity === "0"; })()`)),
    "and the scene's Monster Card is not ghosting behind it");
await shot("killcard");

console.log("\nEXCEPTIONS");
check(bad.length === 0, "nothing threw", bad.slice(0, 3).join(" | "));
console.log(fails ? `\nqa-grove-boss — ${fails} FAILED\n` : "\nOK — the boss kill says what it paid.\n");
try { ws.close(); } catch {}
try { chrome.kill(); } catch {}
process.exit(fails ? 1 : 0);
