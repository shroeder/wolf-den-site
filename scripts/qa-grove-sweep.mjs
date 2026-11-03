// ── EVERY CONTROL IN THE GROVE MUST ACTUALLY BE PRESSABLE ──────────────────────────────────────────────────
// Luke, after finding something broken on every visit: "every time I go look at the Grove, I find an issue
// immediately... NPCs fixed on the screen while you walk, with no ability to interact with them. Then you
// could interact with them, but you couldn't do anything after it opened up the modal, and you couldn't close
// the modal either."
//
// Those are not three bugs. They are one bug three times: SOMETHING IS ON SCREEN AND THE TAP DOES NOT REACH
// IT. A screenshot cannot see it — the thing renders perfectly in all three cases — and a test written for
// any one of them would have missed the other two. So this does not test a list of features. It discovers
// whatever is on screen and asserts the property:
//
//     for every visible control, a tap at its own coordinates must land on it.
//
// The three ways that fails, all of which have happened here in one day:
//   · an ancestor turns pointer-events off and the control inherits it   (the quest dialogue)
//   · something transparent is stacked over it                          (scrims, full-bleed close buttons)
//   · position:fixed resolves against a transformed ancestor, so the    (.tw-scene has a transform)
//     element is laid out somewhere other than where it appears to be
//
// It also walks every destination the menu offers rather than a list written here, because a panel added
// tomorrow is exactly the one nobody will think to add to a list.
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-sweep.mjs
import fs from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const W = Number(process.env.VW || 412);
const H = Number(process.env.VH || 915);

if (!COOKIE) { console.log("no SHOT_COOKIE — mint one with scripts/_mint-shot-session.mjs"); process.exit(1); }
await requireDevServer(PORT);
const chrome = launchChrome(9394, "qa-grove-sweep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9394));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 200) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(400); } return false; };

// ── THE PROBE ───────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ IT TRIES FIVE POINTS, NOT ONE. A control whose centre is covered by its own label is fine — a finger
// landing anywhere on it works — so demanding the centre specifically invents failures. A control where NO
// point reaches it is the real thing.
const PROBE = `(() => {
    const out = [];
    const sel = 'button, [role="button"], a[href], summary, input, select, textarea';
    for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        if (el.disabled || el.getAttribute("aria-hidden") === "true") continue;
        // ⚠️ THE GAME'S OWN UI ONLY. The site header, nav and footer render on the same document and sit
        // UNDER the Grove's full-screen layer, so they are unreachable by design and reporting them buries
        // the real faults under two hundred false alarms. This sweep answers for the Grove, not the site.
        if (el.closest("header, footer, .game-nav, .site-footer, .shell-header, .brand, .webpush-prompt")) continue;
        // ⚠️ SUBSTANTIALLY ON SCREEN, NOT MERELY TOUCHING IT. The street scrolls and panels scroll, so a
        // control can be one pixel inside the viewport with its centre outside — then only the corner
        // probes run, they land on a neighbour, and a perfectly good button is reported as unreachable.
        // Three skill nodes and a forge were called dead that way. Judge a control only when most of it
        // is actually visible; a control you have to scroll to is a design, not a fault.
        const vis = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0))
                  * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        if (vis < r.width * r.height * 0.6) continue;
        const pts = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + r.width * 0.2, r.top + r.height * 0.3],
            [r.left + r.width * 0.8, r.top + r.height * 0.3],
            [r.left + r.width * 0.2, r.top + r.height * 0.8],
            [r.left + r.width * 0.8, r.top + r.height * 0.8],
        ];
        let reached = false;
        let blocker = null;
        let behindWall = false;
        for (const [x, y] of pts) {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const hit = document.elementFromPoint(Math.round(x), Math.round(y));
            if (!hit) continue;
            if (hit === el || el.contains(hit)) { reached = true; break; }
            // ⚠️ BEHIND A WALL IS NOT A BUG. The Grove covers the whole screen, so the site header and
            // footer under it are unreachable BY DESIGN — reporting those was 200 false alarms burying
            // the real ones. A blocker that fills the viewport and does NOT contain this element is a
            // wall; anything smaller is something stacked on top of a control, which is the real fault.
            const hr = hit.getBoundingClientRect();
            if (hr.width >= innerWidth * 0.85 && hr.height >= innerHeight * 0.85 && !hit.contains(el)) {
                behindWall = true;
            } else if (!blocker) {
                blocker = hit.tagName + "." + String(hit.className || "").slice(0, 34);
            }
        }
        // Nothing was testable — every probe point fell outside the viewport, which happens to a building
        // half off the edge of a scrolling street. Not reachable here is not the same as not reachable.
        if (!reached && !blocker) continue;
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 34);
        if (!reached) {
            out.push({ why: cs.pointerEvents === "none" ? "pointer-events:none" : "covered by " + blocker,
                cls: String(el.className || "").slice(0, 40), label });
        }
    }
    return JSON.stringify(out);
})()`;

let fails = 0;
const seen = [];
async function sweep(where) {
    await sleep(1200);
    const dead = JSON.parse(await ev(PROBE) || "[]");
    const n = await ev(`(() => { const probe = ${JSON.stringify("x")}; return document.querySelectorAll('button, [role="button"], a[href]').length; })()`);
    seen.push({ where, n, dead: dead.length });
    if (dead.length) {
        fails += dead.length;
        console.log(`  ✗ ${where} — ${dead.length} of ${n} controls cannot be tapped`);
        for (const d of dead.slice(0, 6)) console.log(`      ${(d.label || "(no label)").padEnd(34)} .${d.cls}  — ${d.why}`);
    } else {
        console.log(`  ✓ ${where} — all ${n} visible controls reachable`);
    }
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

console.log(`\nsweeping the Grove at ${W}x${H}\n`);
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
if (!await waitFor(`document.body.classList.contains("gv-full-lock")`, 200)) { console.log("never reached the Grove"); process.exit(1); }
await sleep(2500);
await sweep("hub (map)");

// ── ⚠️ PROVE THE PROBE CAN STILL FAIL ───────────────────────────────────────────────────────────────────
// A sweep that has only ever come back green is indistinguishable from a sweep that checks nothing — and
// this file has already been tuned four times to remove false alarms, which is exactly the process that
// quietly tunes away the true ones too. So it reproduces the real bug on purpose: pointer-events:none on a
// container, which is what the quest dialogue inherited from the scene it was mounted inside.
{
    await ev(`(() => { const st = document.createElement("style"); st.id = "qa-break";
        st.textContent = ".gv-sheet, .ga-atlas { pointer-events: none !important; }";
        document.head.appendChild(st); return true; })()`);
    await sleep(600);
    const broken = JSON.parse(await ev(PROBE) || "[]");
    await ev(`document.getElementById("qa-break")?.remove()`);
    await sleep(400);
    if (broken.length) {
        console.log(`  ✓ self-test — the probe still catches a dead layer (${broken.length} controls flagged)\n`);
    } else {
        console.log("  ✗ SELF-TEST FAILED — pointer-events:none on the hub was NOT detected.");
        console.log("    Every green below this line is meaningless. Fix the probe before trusting it.\n");
        fails += 1;
    }
}

// ── every destination the MENU offers, discovered rather than listed ────────────────────────────────────
const menuBtn = `document.querySelector(".gv-mhandle, [aria-label='Open menu']")`;
if (await ev(`!!${menuBtn}`)) {
    await ev(`${menuBtn}.click()`);
    await sleep(900);
    const items = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(".gv-mmenu button")]
        .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().replace(/\\s+/g," "))
        .filter((t) => t && !/close menu/i.test(t)))`) || "[]");
    console.log(`\nmenu offers ${items.length}: ${items.join(" · ")}\n`);
    for (const label of items) {
        const opened = await ev(`(() => {
            const b = [...document.querySelectorAll(".gv-mmenu button")]
                .find((x) => ((x.getAttribute("aria-label") || x.textContent || "").trim().replace(/\\s+/g," ")) === ${JSON.stringify(label)});
            if (!b) return false; b.click(); return true; })()`);
        if (!opened) { console.log(`  · ${label} — not found on reopen`); continue; }
        await sleep(1400);
        await sweep(`menu → ${label}`);
        // ── ⚠️ AND A WAY BACK OUT ───────────────────────────────────────────────────────────────
        // Luke: "you couldn't do anything after it opened up the modal, and you couldn't close the
        // modal either." Reachable is only half of it — a surface you can open and cannot leave is a
        // trap, and it looks completely normal in a screenshot. Every destination must offer a control
        // that gets you out, and that control has to be one of the reachable ones.
        const exit = await ev(`(() => {
            const cand = [...document.querySelectorAll("button, [role='button']")].filter((b) => {
                const t = ((b.getAttribute("aria-label") || b.textContent || "")).trim();
                return /^(close|back|leave|done|exit|×|✕|‹|<)$/i.test(t) || /(close|back|leave)/i.test(t)
                    || /gv-exit|gv-back|gv-leave|qd-x|qd-dismiss|gv-mhandle/.test(String(b.className));
            });
            const live = cand.filter((b) => { const r = b.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
            return live.length ? (live[0].getAttribute("aria-label") || live[0].textContent || live[0].className).trim().slice(0, 30) : "";
        })()`);
        if (!exit) { console.log(`      ✗ ${label} — no close/back control on this surface`); fails += 1; }
        // Back to the menu for the next one.
        if (await ev(`!!${menuBtn}`)) { await ev(`${menuBtn}.click()`); await sleep(800); }
    }
    if (await ev(`!!document.querySelector(".gv-mmenu.is-open")`)) { await ev(`${menuBtn}.click()`); await sleep(500); }
}

// ── the town ────────────────────────────────────────────────────────────────────────────────────────────
for (const t of [1, 2]) {
    await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove?view=town&town=${t}` });
    await waitFor(`!!document.querySelector(".gv-town .tw-scene")`, 120);
    await sleep(3000);
    await sweep(`town ${t}`);
}

// ── a zone, and a zone with each thing open ─────────────────────────────────────────────────────────────
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
await waitFor(`document.body.classList.contains("gv-full-lock")`, 200);
await sleep(2000);
await ev(`(() => { const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[1]?.click(); })()`);
if (await waitFor(`!!document.querySelector(".gv-hero")`, 120)) {
    await sleep(3000);
    await sweep("zone");
}

console.log("");
console.log(`  ${seen.length} surfaces swept`);
console.log(fails ? `\n${fails} unreachable control(s) — something is on screen that a tap cannot get to.`
    : `\nevery visible control on every surface can be tapped.`);
fs.mkdirSync("scratch", { recursive: true });
fs.writeFileSync("scratch/grove-sweep.json", JSON.stringify(seen, null, 1));
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
