// ── THE GROVE GIVER, EVERY STATE ────────────────────────────────────────────────────────────────────────────
// The system Luke specified, and the one I had never driven in a browser. Walks into zone 2 (Warden Alder)
// and runs the same assertions the town pass runs: monotonic text, no console errors, the right buttons per
// state, the plate, and that the server actually recorded the acceptance.
import { execFileSync } from "node:child_process";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const setState = (...a) => execFileSync("node", ["scripts/qa-quest-state.mjs", ...a], { encoding: "utf8" }).trim();

await requireDevServer(PORT);
const chrome = launchChrome(9351, "qa-grove-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9351));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });

let id = 0; const pending = new Map(); let bad = [];
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        bad.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
    }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
        const t = m.params.args.map((x) => x.value || x.description || "").join(" ");
        if (!/React DevTools|preloaded using link preload|Fast Refresh/i.test(t)) bad.push(`${m.params.type}: ${t.slice(0, 180)}`);
    }
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 200) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

let fails = 0; const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? "\u2713" : "\u2717"} ${msg}`); if (!ok) fails += 1; };
const section = (t) => out.push(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

async function monotonic(sel, ms = 4000) {
    await ev(`(() => { window.__s=[]; window.__i=setInterval(()=>{const e=document.querySelector(${JSON.stringify(sel)});window.__s.push(e?e.textContent.length:-1);},30); })()`);
    await sleep(ms);
    const s = JSON.parse(await ev(`(() => { clearInterval(window.__i); return JSON.stringify(window.__s); })()`));
    let d = 0, r = 0;
    for (let k = 1; k < s.length; k++) if (s[k] < s[k - 1]) { d += 1; if (s[k] <= 2) r += 1; }
    return { drops: d, restarts: r, samples: s.length };
}

/** Into the Grove, into zone 2, and up to Warden Alder. */
async function openGiver() {
    await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
    if (!await waitFor(`document.body.classList.contains("gv-full-lock")`, 240)) return "no hydration";
    const entered = await ev(`(() => {
        const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
        if (!row) return "no row";
        const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
        const c = cards[1];
        if (!c) return "no zone 2 card";
        if (c.disabled) return "zone 2 locked";
        c.click();
        return "clicked";
    })()`);
    if (entered !== "clicked") return entered;
    if (!await waitFor(`!!document.querySelector(".gv-npc")`, 160)) return "no npc in the zone";
    // ⚠️ A REAL POINTER EVENT. The NPC's handler is onPointerDown, and el.click() does not fire
    // pointerdown — so a DOM click on him is a click into nothing and the rig reports a working
    // feature as broken. [[driving-a-browser-with-cdp]]. He is in the viewport, so coordinates work.
    const box = await ev(`(() => { const r = document.querySelector(".gv-npc").getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }); })()`);
    const { x, y } = JSON.parse(box);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    return (await waitFor(`!!document.querySelector(".qd-panel")`, 80)) ? "open" : "panel never opened";
}

async function tapTo(sel, max = 8) {
    for (let k = 0; k < max; k++) {
        if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return k;
        await ev(`document.querySelector(".qd-panel")?.click()`);
        await sleep(260);
    }
    return -1;
}

for (const mode of ["offer", "active", "ready", "spent"]) {
    section(`GROVE · Warden Alder · ${mode}`);
    out.push(`  ${setState("grove", "alder", mode)}`);
    bad = [];
    const o = await openGiver();
    check(o === "open", `conversation opens (${o})`);
    if (o !== "open") continue;

    const who = await ev(`JSON.stringify({name:document.querySelector(".qd-id b")?.textContent,role:document.querySelector(".qd-id span")?.textContent,steps:document.querySelector(".qd-steps")?.textContent})`);
    check(/Alder/.test(String(who)), `it is the right person — ${who}`);

    const mono = await monotonic(".qd-say");
    check(mono.drops === 0, `text monotonic while idle (${mono.samples} samples, ${mono.drops} drops, ${mono.restarts} restarts)`);

    const taps = await tapTo(".qd-block");
    const blk = await ev(`(() => { const b=document.querySelector(".qd-block"); return b?JSON.stringify({
        label:b.querySelector(".qd-label")?.textContent, task:b.querySelector(".qd-task")?.textContent,
        ask:b.querySelector(".qd-ask")?.textContent, bar:!!b.querySelector(".qd-bar"),
        count:b.querySelector(".qd-count")?.textContent||null,
        accept:document.querySelector(".qd-accept")?.textContent||null }):"none"; })()`);
    check(taps >= 0, `block reached in ${taps} taps`);
    const b = blk === "none" ? {} : JSON.parse(blk);

    if (mode === "spent") {
        check(/Nothing more/i.test(b.label || ""), `says nothing more to ask — ${JSON.stringify(b.label)}`);
        check(!b.accept, "no accept or hand-in button on a finished chain");
    } else {
        check(Boolean(b.ask) && b.ask.length > 12, `the ask is a sentence — ${JSON.stringify(String(b.ask || "").slice(0, 58))}`);
        check(!/·/.test(b.ask || ""), "the ask is prose, not the old 'Defeat 12 · mothlight · zone 4'");
        if (mode === "offer") {
            check(/do it/i.test(b.accept || ""), `offers the take button (${JSON.stringify(b.accept)})`);
            check(!b.bar, "no bar on an untaken step");
        }
        if (mode === "active") {
            check(b.bar && /\d+\/\d+/.test(b.count || ""), `shows progress — ${b.count}`);
            check(!b.accept, "no hand-in while unfinished");
        }
        if (mode === "ready") {
            check(/hand it in/i.test(b.accept || ""), `offers hand-in (${JSON.stringify(b.accept)})`);
            check(/\d+\/\d+/.test(b.count || ""), `shows a full bar — ${b.count}`);
        }
    }
    check(bad.length === 0, `no console errors${bad.length ? ` — ${bad.slice(0, 2).join(" | ")}` : ""}`);
}

section("GROVE · accept → QUEST RECEIVED → send-off");
out.push(`  ${setState("grove", "alder", "offer")}`);
bad = [];
if (await openGiver() === "open") {
    await tapTo(".qd-accept");
    await ev(`document.querySelector(".qd-accept")?.click()`);
    check(await waitFor(`!!document.querySelector(".qd-plate")`, 24), "QUEST RECEIVED appears");
    check(/QUEST RECEIVED/.test(await ev(`document.querySelector(".qd-plate-in")?.textContent||""`)), "plate reads QUEST RECEIVED");
    await sleep(2300);
    check(!(await ev(`!!document.querySelector(".qd-plate")`)), "plate clears");
    const so = await ev(`document.querySelector(".qd-say")?.textContent||""`);
    check(so.length > 0 && !/QUEST/.test(so), `send-off plays — ${JSON.stringify(so.slice(0, 44))}`);
    check(await waitFor(`!document.querySelector(".qd-panel")`, 16), "closes itself");
    const started = await ev(`fetch("/api/marketplace/grove/quests",{cache:"no-store"}).then(r=>r.json()).then(d=>{
        const rows = d.board || d.npcs || d.quests || [];
        const a = Array.isArray(rows) ? rows.find((x)=>x.npc==="alder") : null;
        return JSON.stringify(a ? {id:a.active?.id, started:a.active?.started} : {keys:Object.keys(d)});
    }).catch((e)=>"ERR "+e)`);
    check(/"started":true/.test(String(started)), `server records the acceptance — ${started}`);
    check(bad.length === 0, `no console errors${bad.length ? ` — ${bad.slice(0, 2).join(" | ")}` : ""}`);
}

out.push(`\n  cleanup: ${setState("grove", "alder", "reset")}`);
console.log(out.join("\n"));
console.log(`\n${fails ? `${fails} FAILURES` : "all checks passed"}`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
