// ── PLAY A COLISEUM, END TO END, AND PHOTOGRAPH WHAT IT SAYS ────────────────────────────────────────────────
// Luke, 2026-11-12: "Play it."
//
// The Coliseum had never been run by anybody — `runs: 0` on the owner's own account — and the four reward
// moments I just wired (the key refusal, the run summary, the boss kill, the opened chest) were verified by
// reading the code and compiling it. That is not the same as the screen actually saying something, and this
// repo's whole scar tissue is on that difference: every regression in the release guide rendered perfectly
// while being broken. [[watch-it-run-before-done]]
//
// ⚠️ THIS IS A READING, NOT A GATE. It is deliberately not in package.json. It drives one real run on Luke's
// own account, prints what each moment put on screen, and leaves PNGs behind. [[gates-dont-make-them]]
//
// ⚠️ AND IT SPENDS A REAL KEY. Three per map per day, so one run is cheap and the daily refills it — but it
// is a real mutation on a real account, which is why this names the account it is playing as before it does
// anything.
//
//   SHOT_COOKIE=<token> PORT=3100 node scripts/qa-grove-coliseum.mjs
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const OUT = process.env.OUT || "scratch/coliseum";
if (!COOKIE) { console.error("SHOT_COOKIE is required — node scripts/_mint-shot-session.mjs"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9361, "qa-coliseum-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9361));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map(); const bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    // ⚠️ CHUNK ERRORS ARE NOISE IN DEV, everything else is a real exception and this run should say so.
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
    const tag = `${String(step).padStart(2, "0")}-${name}`;
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r?.data) { writeFileSync(`${OUT}/${tag}.png`, Buffer.from(r.data, "base64")); console.log(`     shot ${OUT}/${tag}.png`); }
}

// ── ⚠️ A REAL POINTER, NOT element.click() ──────────────────────────────────────────────────────────────────
// The foes, the chests, the Coliseum gate and the marshal are all `onPointerDown` handlers, and `.click()`
// does not produce a pointerdown — it dispatches a click and nothing else, so every one of these would do
// absolutely nothing while the rig reported having tapped them. That is the exact failure in
// [[driving-a-browser-with-cdp]]: a rig that passes by never touching the thing it claims to touch.
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
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "mouse" });
    }
    return true;
}

let fails = 0;
const check = (ok, msg, extra = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}${extra ? `  ${extra}` : ""}`);
    if (!ok) fails += 1;
};
const text = () => ev(`document.body.innerText.replace(/\\s+/g, " ")`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
// A phone, because that is what this game is played on. [[verify-on-real-phone-sizes]]
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

// Record every coliseum call and its answer, so the screen can be compared against what the server said
// rather than against what I think it said.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__enter = null; window.__col = [];
    const orig = window.fetch;
    window.fetch = async (...a) => {
        const r = await orig(...a);
        try {
            const u = String(a[0]);
            if (u.includes("/api/marketplace/grove")) {
                const j = await r.clone().json();
                if (j && j.zone) window.__enter = j;
                if (u.includes("/coliseum")) window.__col.push({ u, j });
            }
        } catch {}
        return r;
    };
` });

console.log("\nWHO AM I PLAYING AS");
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
const locked = await waitFor(`document.body.classList.contains("gv-full-lock")`, 240);
check(locked, "the Grove loaded");
if (!locked) { console.log(await text()); process.exit(1); }
await sleep(1500);

// ── ENTER THE ZONE THE COLISEUM STANDS IN ───────────────────────────────────────────────────────────────────
// Map one's is zone 7, The Barrows (COLISEUM_ZONE in grove-coliseum-plan.js). Found by NAME rather than by
// index: an index into the atlas row silently points at a different zone the day a row gains a card.
const ZONE_NAME = process.env.ZONE || "The Barrows";
console.log(`\nWALKING INTO ${ZONE_NAME.toUpperCase()}`);
const entered = await ev(`(() => {
    const cards = [...document.querySelectorAll(".ga-card")];
    const card = cards.find((c) => (c.textContent || "").includes(${JSON.stringify(ZONE_NAME)}));
    if (!card) return "no card named it: " + cards.map((c) => (c.textContent || "").trim().slice(0, 18)).join("|");
    card.click();
    return "clicked";
})()`);
check(entered === "clicked", `found the zone card`, entered === "clicked" ? "" : String(entered).slice(0, 200));
await waitFor(`!!window.__enter`, 80);
await sleep(2500);

const sent = JSON.parse(await ev(`JSON.stringify({
    zone: window.__enter?.zone?.n,
    name: window.__enter?.zone?.name,
    coliseum: window.__enter?.coliseum || null,
})`) || "{}");
console.log(`     server sent zone ${sent.zone} (${sent.name}), coliseum ${JSON.stringify(sent.coliseum)}`);
check(!!sent.coliseum, "the zone carries a coliseum");
check((await ev(`document.querySelectorAll(".gv-colgate").length`)) === 1, "the building is standing in the world");
check((await ev(`document.querySelectorAll(".gv-colnpc").length`)) === 1, "and the marshal is standing beside it");
await shot("zone");

// ── THE MARSHAL ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nTHE MARSHAL");
check(await tap(".gv-colnpc"), "tapped the marshal");
await sleep(900);
// ⚠️ READ THE PANEL, NOT document.body. The first version matched /Coliseum|key/ against the whole
// page and passed on the site nav's own words while the marshal's card was not even open — a check
// that cannot fail is not a check. [[a-test-cannot-share-the-codes-guess]]
const marshalText = await ev(`(() => {
    const el = [...document.querySelectorAll("div,section,aside")].find((d) => /Coliseum Marshal/i.test(d.innerText || ""));
    return (el?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400);
})()`);
check(/Marshal/i.test(String(marshalText)), "his card is open", String(marshalText).slice(0, 200));
await shot("marshal");

// ── START THE RUN ───────────────────────────────────────────────────────────────────────────────────────────
console.log("\nTHE RUN");
const startedBy = await ev(`(() => {
    // ⚠️ THE WORDS ARE HIS, NOT A GENERIC "Enter". The card reads "Take your token" / "Step inside" /
    // "Walk away" — matching on /^enter/ found nothing and the rig then tapped the gate THROUGH the
    // open card, which is how the first run reported 211 taps and no run at all.
    const all = [...document.querySelectorAll("button")].map((x) => (x.textContent || "").trim());
    const b = [...document.querySelectorAll("button")].find((x) => /step inside|enter the coliseum|^enter$/i.test((x.textContent || "").trim()));
    if (b) { b.click(); return (b.textContent || "").trim(); }
    return "NO MATCH among: " + all.filter(Boolean).slice(-8).join(" | ");
})()`);
if (!startedBy || String(startedBy).startsWith("NO MATCH")) {
    console.log(`     ${startedBy}`);
    // No Enter button on the card — close it and walk into the building itself, which is the other door.
    await ev(`document.querySelector(".gv-pv-x, .gv-sheet-x")?.click()`);
    await sleep(600);
    check(await tap(".gv-colgate"), "tapped the building instead");
} else {
    check(true, `pressed "${startedBy}" on the marshal's card`);
}
const running = await waitFor(`!!document.querySelector(".gv-scene") && !!window.__col.find((c) => c.j && c.j.plan && c.j.ok)`, 60);
const startAnswer = JSON.parse(await ev(`JSON.stringify(window.__col.map((c) => ({ u: c.u.split("/").pop(), ok: c.j?.ok, error: c.j?.error, keys: c.j?.keys })))`) || "[]");
console.log(`     coliseum calls: ${JSON.stringify(startAnswer)}`);
check(running, "a run started");
await sleep(1200);
await shot("arena");

// ── FIGHT IT ────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ TAPPING A FOE IS THE WHOLE CONTROL SCHEME. onTapFoe sets w.target and the hero auto-attacks it, then
// steps to whatever is already in reach — so one tap per crowd, not one per creature. The clock is 120s.
console.log("\nFIGHTING (120s of clock)");
const began = Date.now();
let taps = 0;
let lastSeen = 0;
while (Date.now() - began < 150000) {
    const over = await ev(`!!document.querySelector(".gv-pop")`);
    if (over) break;
    const live = await ev(`document.querySelectorAll(".gv-foe").length`);
    if (live > 0) {
        // Always re-pick: the body that was nearest a second ago may be dead, and a tap on a corpse is a
        // tap that does nothing while the hero stands still.
        const nearest = await ev(`(() => {
            const h = document.querySelector(".gv-hero");
            const hr = h?.getBoundingClientRect();
            const hx = hr ? hr.left + hr.width / 2 : 215;
            const foes = [...document.querySelectorAll(".gv-foe")].map((f) => {
                const r = f.getBoundingClientRect();
                return { i: [...document.querySelectorAll(".gv-foe")].indexOf(f), d: Math.abs(r.left + r.width / 2 - hx), w: r.width };
            }).filter((f) => f.w > 0).sort((a, b) => a.d - b.d);
            return foes[0]?.i ?? -1;
        })()`);
        if (nearest >= 0) { await tap(".gv-foe", nearest); taps += 1; }
    }
    if (live !== lastSeen) { lastSeen = live; }
    // ⚠️ FAST, AND ALWAYS AT THE NEAREST BODY. Measured across three real runs: 700ms taps cleared two
    // waves, 2500ms cleared one. Slowing down made it WORSE, which says the bottleneck is not retarget
    // thrash — it is that auto-attack only steps to what is already within reach + 3, so after each kill
    // in a 26-unit arena the hero simply stops. The tap IS the walk order. A human taps continuously;
    // this is the closest a rig gets.
    await sleep(Number(process.env.TAP_MS || 400));
}
console.log(`     ${taps} taps, ${Math.round((Date.now() - began) / 1000)}s elapsed`);

// ── THE RUN SUMMARY ─────────────────────────────────────────────────────────────────────────────────────────
console.log("\nWHAT THE BELL SAID");
const cardUp = await waitFor(`!!document.querySelector(".gv-pop")`, 40);
check(cardUp, "a card came up at the end of the run");
const cardText = await ev(`(document.querySelector(".gv-pop")?.innerText || "").replace(/\\s+/g, " ").trim()`);
console.log(`     card: ${JSON.stringify(cardText)}`);
check(/wave/i.test(String(cardText)), "it names the waves", String(cardText).slice(0, 120));
const settle = JSON.parse(await ev(`JSON.stringify(window.__col.filter((c) => c.j && typeof c.j.wavesCleared === "number").map((c) => c.j))`) || "[]");
console.log(`     server settled: ${JSON.stringify(settle)}`);
if (settle[0]) {
    check(String(cardText).includes(String(settle[0].wavesCleared)),
        "and the number on screen is the number the server settled",
        `screen says "${cardText}", server said ${settle[0].wavesCleared}/${settle[0].totalWaves}`);
}
await shot("runcard");

// ── THE CHESTS ON THE SAND ──────────────────────────────────────────────────────────────────────────────────
console.log("\nTHE CHESTS");
await ev(`document.querySelector(".gv-pop")?.click()`);
await sleep(900);
const chests = await ev(`document.querySelectorAll(".gv-zchest").length`);
console.log(`     ${chests} chest(s) on the floor`);
check(chests > 0 || (settle[0] && settle[0].wavesCleared / (settle[0].totalWaves || 12) < 0.25),
    "chests are there, or the run did not earn any");
await shot("sand");

if (chests > 0) {
    check(await tap(".gv-zchest"), "tapped a chest");
    // The rattle, then the reveal. Both are photographed because the rattle is the half Luke asked for.
    const rattling = await waitFor(`!!document.querySelector(".chest-stage")`, 20);
    check(rattling, "it rattles before it opens");
    if (rattling) await shot("rattle");
    const opened = await waitFor(`!!document.querySelector(".gv-pop-card")`, 40);
    check(opened, "and then it opens onto a card");
    const loot = await ev(`(document.querySelector(".gv-pop-card")?.innerText || "").replace(/\\s+/g, " ").trim()`);
    console.log(`     chest card: ${JSON.stringify(loot)}`);
    const openCall = JSON.parse(await ev(`JSON.stringify(window.__col.filter((c) => c.j && c.j.gear).map((c) => c.j))`) || "[]");
    console.log(`     server paid: ${JSON.stringify(openCall)}`);
    if (openCall[0]?.gear?.length) {
        const names = openCall[0].gear.map((g) => g.name);
        check(names.every((n) => String(loot).includes(n)),
            "every piece the server granted is named on the card",
            `granted ${names.join(", ")}`);
        check((await ev(`document.querySelectorAll(".gv-pop-card .item-art").length`)) >= names.length,
            "and each one has art rather than a hole");
    }
    await shot("reveal");
}

console.log("\nEXCEPTIONS");
check(bad.length === 0, "nothing threw while playing", bad.slice(0, 3).join(" | "));

console.log(fails ? `\nqa-grove-coliseum — ${fails} FAILED\n` : "\nOK — the Coliseum was played and every moment said something.\n");
try { ws.close(); } catch {}
try { chrome.kill(); } catch {}
process.exit(fails ? 1 : 0);
