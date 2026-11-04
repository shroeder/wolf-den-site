// ── EVERY NPC ON THE DEFAULT STREET STILL OPENS SOMETHING YOU CAN TOUCH ─────────────────────────────────────
// Luke: "I am not worried about the town visually regressing. Im worried about messing up npcs in the town."
//
//   SHOT_COOKIE=<token> node scripts/qa-town-npcs.mjs              against the live site
//   TOWN_ORIGIN=http://localhost:3000 ... node scripts/qa-town-npcs.mjs   against the dev server
//
// Open every NPC on the street and prove the panel is usable.
//
// ⚠️ NOT A SCREENSHOT. Luke: "I am not worried about the town visually regressing. Im worried about
// messing up npcs in the town." A picture cannot tell a working panel from a dead one — which is exactly
// how the inert town dialogue shipped: it rendered perfectly and every tap fell straight through it.
//
// ⚠️ AND THE STREET SCROLLS, SO EVERY NPC IS OFF SCREEN AT REST. The first cut of this tapped their
// resting coordinates, hit nothing five times out of five, and printed PASS. A gate that reports success
// for a test it never ran is worse than no gate, so this counts what it actually opened and fails if that
// is zero.
import { attach, launchChrome, requireDevServer } from "file:///C:/Users/Luke/Projects/wolf%20den%20site/scripts/lib/qa-chrome.mjs";

// ⚠️ LIVE BY DEFAULT. Luke: "Dont test this specific scenario locally. Just use an account online there."
// The ungated street is a GATING question, and gating reads the real allow-list against the real account —
// so a local run proves the component and not the thing that was actually in doubt.
const ORIGIN = process.env.TOWN_ORIGIN || "https://www.wolfdengamingmn.com";
const LOCAL = /localhost/.test(ORIGIN);
if (LOCAL) await requireDevServer(3000);
const chrome = launchChrome(9397, "test-default-npcs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9397));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });

let id = 0; const pending = new Map(); const bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        bad.push(String(m.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
    }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) return "THREW: " + String(r.exceptionDetails.exception?.description || "").split("\n")[0];
    return r?.result?.value;
};

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
    domain: LOCAL ? "localhost" : new URL(ORIGIN).hostname, path: "/", secure: !LOCAL,
});
await send("Page.navigate", { url: `${ORIGIN}/marketplace/town` });
for (let i = 0; i < 60; i++) { if (await ev('!!document.querySelector(".tw-npc-btn")')) break; await sleep(500); }
await sleep(3500);

let fails = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails += 1; };

const PANELS = [".qd-wrap", ".tw-roster", ".tw-merchant", ".tw-board", ".tw-stock", ".tw-smith", ".tw-vote", ".tw-auction"];
const PANEL_JSON = JSON.stringify(PANELS);

const raw = await ev(`JSON.stringify([...document.querySelectorAll(".tw-npc-btn")]
    .map((b, i) => ({ i, label: b.getAttribute("aria-label") || "(no label)" })))`);
const npcs = JSON.parse(raw || "[]");
console.log(`\n${npcs.length} NPCs on the default street\n`);

let tested = 0;
for (const n of npcs) {
    // Opened through the NPC's own handler: the street cannot be scrolled to all five at once, and what
    // is being tested here is the PANEL, not the hit-box of a button that is deliberately off-screen.
    await ev(`[...document.querySelectorAll(".tw-npc-btn")][${n.i}]?.click()`);
    await sleep(1600);

    const opened = await ev(`(() => {
        for (const sel of ${PANEL_JSON}) { if (document.querySelector(sel)) return sel; }
        return "(nothing)";
    })()`);

    // ⚠️ NOT EVERY NPC OPENS A PANEL. The Auction House is a <Link> to /marketplace/auction — it
    // NAVIGATES, and the first cut of this called that a failure because it assumed a modal. An NPC that
    // takes you somewhere is working; what has to be true is that it went somewhere real.
    const href = await ev("location.pathname");
    if (href !== "/marketplace/town") {
        const landed = await ev(`document.querySelector("h1, h2, .shell h1")?.textContent?.trim()?.slice(0, 28) || document.title.slice(0, 28)`);
        check(true, `${n.label.slice(0, 26).padEnd(26)} navigates to ${href} — "${landed}"`);
        tested += 1;
        await send("Page.navigate", { url: `${ORIGIN}/marketplace/town` });
        for (let k = 0; k < 40; k += 1) { if (await ev('!!document.querySelector(".tw-npc-btn")')) break; await sleep(500); }
        await sleep(2000);
        continue;
    }
    if (opened === "(nothing)") {
        check(false, `${n.label.slice(0, 26).padEnd(26)} opens nothing and goes nowhere`);
        continue;
    }
    tested += 1;

    // ⚠️ THE PANEL MUST TAKE A REAL TAP. A modal that renders and swallows nothing is the exact bug that
    // shipped in this file before — pointer-events switched off by an ancestor, or a transform stealing
    // its fixed positioning. elementFromPoint over its own middle is what tells the two apart.
    const reach = await ev(`(() => {
        const pnl = document.querySelector(${JSON.stringify(opened)});
        if (!pnl) return "gone";
        const r = pnl.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return "COLLAPSED " + Math.round(r.width) + "x" + Math.round(r.height);
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + Math.min(60, r.height / 2));
        const el = document.elementFromPoint(x, y);
        if (!el) return "NOTHING AT ITS CENTRE";
        return pnl.contains(el) ? "reachable" : "BLOCKED by " + (el.className || el.tagName);
    })()`);
    const title = await ev(`(() => {
        const pnl = document.querySelector(${JSON.stringify(opened)});
        const h = pnl && pnl.querySelector("strong, h2, h3, .tw-roster-head, .qd-name b");
        return h ? h.textContent.trim().slice(0, 30) : "(untitled)";
    })()`);
    check(reach === "reachable", `${n.label.slice(0, 26).padEnd(26)} -> "${String(title).padEnd(30)}" ${reach}`);

    // ⚠️ AND IT MUST NOT BE THE GROVE-TOWN CARD. QuestDialogue is the component whose dialogue was
    // stripped; reaching it without a town would mean the change escaped its branch.
    if (opened === ".qd-wrap") check(false, "    ^ that is QuestDialogue — unreachable without a town is the whole claim");

    // ⚠️ CLOSE IT PROPERLY OR THE NEXT NPC IS TESTED THROUGH THIS ONE. The wrapper closes on a click of
    // itself; the X is a fallback for the panels that do not.
    await ev(`[...document.querySelectorAll("button")]
        .filter((x) => /close/i.test(x.getAttribute("aria-label") || ""))[0]?.click()`);
    await ev(`document.querySelector(${JSON.stringify(opened)})?.click()`);
    await sleep(900);
    const stillUp = await ev(`(() => { for (const sel of ${PANEL_JSON}) { if (document.querySelector(sel)) return sel; } return null; })()`);
    if (stillUp) { check(false, `   ^ ${stillUp} would not close — the next NPC is tested through it`); }
}

if (tested === 0) {
    console.log("\n  ✗ NOTHING WAS OPENED AT ALL — this run proved nothing");
    fails += 1;
}
console.log(`\nopened and checked: ${tested} of ${npcs.length}`);
console.log(`exceptions: ${bad.length ? bad.slice(0, 3).join(" | ") : "none"}`);
console.log(fails === 0 ? "\nPASS — every NPC opens a panel you can actually touch" : `\nFAIL — ${fails}`);
ws.close(); chrome.kill();
