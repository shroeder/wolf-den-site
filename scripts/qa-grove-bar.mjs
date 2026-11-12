// ── GRIND THE KILL BAR UNTIL IT PAYS, AND SEE WHICH RUNG IT PAYS ────────────────────────────────────────────
// Luke's original report: "Its kinda weird that I can unlock a later tier of tool before having the one
// before it." The fix makes a fill pay ONE rung up from what you hold rather than the map's tier — and it
// shipped without anybody seeing a single fill, which is the whole reason this exists.
//
// The owner's own state is the perfect demonstration: four tools at II, a hoe at I, seven slots empty, and
// his map-2 bar at 63 of 250. Lowest-tier-first means the next fill must hand over a SEXTANT AT TIER I. The
// old rule would have handed over a sextant at tier II, with tier I never having existed.
//
// ⚠️ A READING, NOT A GATE, and it is a long one: 187 kills at a 40-a-minute ceiling is five minutes of
// floor and realistically more, because a rig taps slower than a person.
//
//   SHOT_COOKIE=<token> PORT=3100 node scripts/qa-grove-bar.mjs ["The Spore Hall"]
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const ZONE_NAME = process.argv[2] || process.env.ZONE || "The Spore Hall";
const OUT = process.env.OUT || "scratch/coliseum";
if (!COOKIE) { console.error("SHOT_COOKIE is required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9363, "qa-bar-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9363));
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
    const tag = `g${String(step).padStart(2, "0")}-${name}`;
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


console.log("\nWHAT THE BAR OWES");
const before = await ev(`JSON.stringify({ kills: window.__enter?.bar?.kills, need: window.__enter?.bar?.need, next: window.__enter?.bar?.next })`);
console.log(`     ${before}`);
await shot("start");

// ── ⚠️ A TAP IS THE WALK ORDER AS WELL AS THE ATTACK ────────────────────────────────────────────────────────
// Auto-attack only steps to what is already within reach, so after each kill the hero stops. Tapping the
// nearest body is both "go there" and "hit it"; when the screen is empty of bodies, walk and let the zone
// respawn into view. The 40-a-minute population ceiling is the real floor on this, not the input.
async function walk(dir, ms) {
    const x = dir > 0 ? 410 : 20;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y: 700, button: "left", clickCount: 1, pointerType: "mouse" });
    const until = Date.now() + ms;
    while (Date.now() < until) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: 700, button: "left", pointerType: "mouse" });
        await sleep(120);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: 700, button: "left", clickCount: 1, pointerType: "mouse" });
}

console.log("\nGRINDING");
const began = Date.now();
const CAP_MS = Number(process.env.CAP_MS || 900000);
let taps = 0, dir = 1, dry = 0;
let paid = null;
while (Date.now() - began < CAP_MS) {
    // The reveal is the thing being waited for: the bar's chest rattles, then opens onto what it paid.
    if (await ev(`!!document.querySelector(".gv-pop")`)) { paid = "pop"; break; }
    const onGlass = await ev(`(() => [...document.querySelectorAll(".gv-foe")].filter((f) => {
        const r = f.getBoundingClientRect();
        return r.width > 0 && r.right > 8 && r.left < window.innerWidth - 8;
    }).length)()`);
    if (onGlass > 0) {
        dry = 0;
        const i = await ev(`(() => {
            const all = [...document.querySelectorAll(".gv-foe")];
            const h = document.querySelector(".gv-hero")?.getBoundingClientRect();
            const hx = h ? h.left + h.width / 2 : 215;
            let best = -1, bd = 1e9;
            all.forEach((f, k) => {
                const r = f.getBoundingClientRect();
                if (r.width < 1 || r.right < 8 || r.left > window.innerWidth - 8) return;
                const d = Math.abs(r.left + r.width / 2 - hx);
                if (d < bd) { bd = d; best = k; }
            });
            return best;
        })()`);
        if (i >= 0) { await tap(".gv-foe", i); taps += 1; }
        await sleep(Number(process.env.TAP_MS || 350));
    } else {
        dry += 1;
        // Sweep back and forth: the zone is several screens wide and respawns on a 45s clock.
        if (dry % 3 === 0) dir = -dir;
        await walk(dir, 2000);
    }
    if (taps % 40 === 0 && taps > 0) {
        const k = await ev(`(document.querySelector(".gv-bar-count, .gv-bar")?.innerText || "").replace(/\s+/g, " ")`);
        console.log(`     ${taps} taps, ${Math.round((Date.now() - began) / 1000)}s, bar: ${JSON.stringify(k)}`);
    }
}
console.log(`     ${taps} taps, ${Math.round((Date.now() - began) / 1000)}s`);

console.log("\nWHAT THE BAR PAID");
check(Boolean(paid), "the bar filled and opened something", paid ? "" : "no reveal inside the cap");
if (paid) {
    // It rattles first, so give the sequence its 2.5 seconds before reading the card.
    await waitFor(`!!document.querySelector(".gv-pop-card")`, 30);
    const cardText = await ev(`(document.querySelector(".gv-pop")?.innerText || "").replace(/\s+/g, " ").trim()`);
    console.log(`     card: ${JSON.stringify(cardText)}`);
    await shot("reveal");
    // ⚠️ THE RUNG IS THE WHOLE POINT. The owner holds nothing in the sextant slot, so a map-2 bar must pay
    // tier I of it — numeral "I", not "II". This is Luke's report, as an assertion, on a real screen.
    check(/\bI\b/.test(String(cardText)) && !/\bII\b/.test(String(cardText)),
        "it paid the FIRST rung of an empty slot, not the map's tier", String(cardText).slice(0, 140));
}

console.log("\nEXCEPTIONS");
check(bad.length === 0, "nothing threw", bad.slice(0, 3).join(" | "));
console.log(fails ? `\nqa-grove-bar — ${fails} FAILED\n` : "\nOK — the bar pays a rung at a time.\n");
try { ws.close(); } catch {}
try { chrome.kill(); } catch {}
process.exit(fails ? 1 : 0);
