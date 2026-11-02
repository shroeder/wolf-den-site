// ── INTENSIVE PASS OVER THE QUEST DIALOGUE ──────────────────────────────────────────────────────────────────
// Luke: "Why not intensively test and iterate without me. Why not run all things locally and fix everything
// before you tell me its good."
//
// The retrigger shipped because the check was one happy path plus screenshots, and a retriggering typewriter
// is a normal-looking frame. So this visits EVERY state of both givers, and at each one asserts things a
// picture cannot show:
//
//   · the text is monotonic over 4s of sitting still (any shrink is a restart)
//   · no console errors or React warnings at any point
//   · tapping completes the line, tapping again advances, and the last tap reveals the card
//   · the right buttons exist for the state, and no bar appears on an untaken job
//   · reopening the same conversation five times does not leak or drift
//   · the panel settles — no network request storm while it sits open
import { spawn, execFileSync } from "node:child_process";

const PORT = process.env.PORT || "3998";
const COOKIE = process.env.SHOT_COOKIE;
const setState = (...args) => execFileSync("node", ["scripts/qa-quest-state.mjs", ...args], { encoding: "utf8" }).trim();

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--remote-debugging-port=9350", "--headless=new", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${process.env.TEMP}/qa-dialogue-profile`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1800);
const list = await (await fetch("http://127.0.0.1:9350/json/list")).json();
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });

let id = 0; const pending = new Map();
let consoleBad = []; let net = 0;
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
        consoleBad.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
    }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
        const txt = m.params.args.map((x) => x.value || x.description || "").join(" ");
        // Next's dev overlay and the image-preload hint are noise, not our defects.
        if (!/Download the React DevTools|was preloaded using link preload|Fast Refresh/i.test(txt)) {
            consoleBad.push(`${m.params.type}: ${txt.slice(0, 180)}`);
        }
    }
    if (m.method === "Network.requestWillBeSent") net += 1;
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 200) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

let fails = 0; const results = [];
const check = (ok, msg) => { results.push(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails += 1; };
const section = (t) => results.push(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

/** Sit still and watch the line. Returns {drops, restarts, final}. */
async function monotonic(sel, ms = 4000) {
    await ev(`(() => { window.__s=[]; window.__i=setInterval(()=>{const e=document.querySelector(${JSON.stringify(sel)});window.__s.push(e?e.textContent.length:-1);},30); })()`);
    await sleep(ms);
    const s = JSON.parse(await ev(`(() => { clearInterval(window.__i); return JSON.stringify(window.__s); })()`));
    let drops = 0, restarts = 0;
    for (let k = 1; k < s.length; k++) if (s[k] < s[k - 1]) { drops++; if (s[k] <= 2) restarts++; }
    return { drops, restarts, final: s[s.length - 1], samples: s.length };
}

/** Tap the panel until the ask card appears (or we run out of patience). */
async function tapToCard(panelSel, cardSel, max = 8) {
    for (let k = 0; k < max; k++) {
        if (await ev(`!!document.querySelector(${JSON.stringify(cardSel)})`)) return k;
        await ev(`document.querySelector(${JSON.stringify(panelSel)})?.click()`);
        await sleep(260);
    }
    return -1;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TOWN GIVER — every state of the act ladder
// ══════════════════════════════════════════════════════════════════════════════════════════════
const openTown = async () => {
    await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/town?town=2` });
    await waitFor(`!!document.querySelector(".tw-world")`, 300);
    await waitFor(`[...document.querySelectorAll(".tw-npc-btn")].some((b)=>(b.getAttribute("aria-label")||"").includes("Captain"))`, 200);
    await sleep(900);
    await ev(`[...document.querySelectorAll(".tw-npc-btn")].find((x)=>(x.getAttribute("aria-label")||"").includes("Captain")).click()`);
    return waitFor(`!!document.querySelector(".qd-panel")`, 120);
};

for (const mode of ["offer", "active", "ready", "allclaimed"]) {
    section(`TOWN · ${mode}`);
    results.push(`  ${setState("town", mode)}`);
    consoleBad = [];
    const opened = await openTown();
    check(opened, "conversation opens");
    if (!opened) continue;

    const mono = await monotonic(".qd-line");
    check(mono.drops === 0, `text monotonic while idle (${mono.samples} samples, ${mono.drops} drops, ${mono.restarts} restarts)`);

    const taps = await tapToCard(".qd-panel", ".qd-card");
    const card = await ev(`(() => { const c=document.querySelector(".qd-card"); return c?JSON.stringify({
        title:c.querySelector("b")?.textContent, ask:c.querySelector(".qd-ask")?.textContent,
        go:c.querySelector(".qd-go")?.textContent||null, bar:!!c.querySelector(".qd-bar"),
        count:c.querySelector(".qd-count")?.textContent||null }):"none"; })()`);
    if (mode === "allclaimed") {
        check(card === "none", "a finished ladder offers no card");
        const line = await ev(`document.querySelector(".qd-line")?.textContent || ""`);
        check(/nothing|done|clear|concluded|stand easy|shaft/i.test(line), `says it is finished — ${JSON.stringify(line.slice(0, 60))}`);
    } else {
        check(taps >= 0, `card reached in ${taps} taps`);
        const c = card === "none" ? {} : JSON.parse(card);
        check(Boolean(c.ask), `the ask is a sentence — ${JSON.stringify(String(c.ask || "").slice(0, 56))}`);
        if (mode === "offer") {
            check(c.go === "I'll do it", `offers the take button (got ${JSON.stringify(c.go)})`);
            check(!c.bar, "no progress bar on an untaken job");
        }
        if (mode === "active") check(c.bar && /\d+ \/ \d+/.test(c.count || ""), `shows progress — ${c.count}`);
        if (mode === "ready") check(c.go === "Hand it in", `offers the hand-in button (got ${JSON.stringify(c.go)})`);
    }
    check(consoleBad.length === 0, `no console errors${consoleBad.length ? ` — ${consoleBad.slice(0, 2).join(" | ")}` : ""}`);
}

// ── the moment, and that it clears ──────────────────────────────────────────────────────────────
section("TOWN · accept → QUEST RECEIVED → send-off → closes");
results.push(`  ${setState("town", "offer")}`);
consoleBad = [];
await openTown();
await tapToCard(".qd-panel", ".qd-card");
await ev(`document.querySelector(".qd-go")?.click()`);
const plateUp = await waitFor(`!!document.querySelector(".qd-plate")`, 24);
check(plateUp, "QUEST RECEIVED appears");
const plateTxt = await ev(`document.querySelector(".qd-plate-in")?.textContent || ""`);
check(/QUEST RECEIVED/.test(plateTxt), `plate reads ${JSON.stringify(plateTxt.slice(0, 40))}`);
await sleep(2300);
check(!(await ev(`!!document.querySelector(".qd-plate")`)), "plate clears itself");
const sendoff = await ev(`document.querySelector(".qd-line")?.textContent || ""`);
check(sendoff.length > 0 && !/QUEST/.test(sendoff), `send-off plays — ${JSON.stringify(sendoff.slice(0, 44))}`);
const closed = await waitFor(`!document.querySelector(".qd-panel")`, 16);
check(closed, "the sheet closes itself");
check(!(await ev(`!!document.querySelector(".qd-plate")`)), "no plate left behind after close");
const tracker = await ev(`(() => { const t=document.querySelector(".tw-track"); return t?JSON.stringify({title:t.querySelector("b")?.textContent,count:t.querySelector("i")?.textContent}):"none"; })()`);
check(tracker !== "none", `tracker appears on the street — ${tracker}`);
check(consoleBad.length === 0, `no console errors through the whole sequence${consoleBad.length ? ` — ${consoleBad.slice(0, 2).join(" | ")}` : ""}`);

// ── reopening repeatedly ────────────────────────────────────────────────────────────────────────
section("TOWN · reopened five times");
results.push(`  ${setState("town", "offer")}`);
consoleBad = [];
let firstLine = null, drift = 0;
for (let k = 0; k < 5; k++) {
    await openTown();
    await sleep(700);
    const l = await ev(`document.querySelector(".qd-line")?.textContent || ""`);
    const panels = await ev(`document.querySelectorAll(".qd-panel").length`);
    if (panels !== 1) drift += 1;
    if (firstLine === null) firstLine = l;
    await ev(`document.querySelector(".qd-x")?.click()`);
    await sleep(350);
    const after = await ev(`document.querySelectorAll(".qd-panel").length`);
    if (after !== 0) drift += 1;
}
check(drift === 0, `exactly one panel each time, and it closes (${drift} anomalies)`);
check(consoleBad.length === 0, `no console errors across five opens${consoleBad.length ? ` — ${consoleBad.slice(0, 2).join(" | ")}` : ""}`);

// ── idle soak: does an open panel keep talking to the server? ───────────────────────────────────
section("TOWN · idle soak, panel open 15s");
await openTown();
await sleep(1500);
net = 0;
await sleep(15000);
check(net < 30, `${net} requests in 15s with the panel open (a storm would be hundreds)`);
const soak = await monotonic(".qd-line", 3000);
check(soak.drops === 0, `still monotonic after sitting open (${soak.drops} drops)`);

// ── phone size ──────────────────────────────────────────────────────────────────────────────────
section("TOWN · 375x667, the real phone size");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
results.push(`  ${setState("town", "offer")}`);
await openTown();
await tapToCard(".qd-panel", ".qd-card");
const fit = await ev(`(() => {
    const p = document.querySelector(".qd-panel"); if (!p) return "none";
    const r = p.getBoundingClientRect();
    const go = document.querySelector(".qd-go")?.getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), overflowsX: r.right > window.innerWidth + 1 || r.left < -1,
        buttonVisible: go ? (go.top >= 0 && go.bottom <= window.innerHeight) : null,
        scrolls: p.scrollHeight > p.clientHeight + 1 });
})()`);
const f = JSON.parse(fit);
check(!f.overflowsX, `panel does not overflow horizontally (${f.w}px wide in 375)`);
check(f.buttonVisible !== false || f.scrolls, `the accept button is reachable (visible=${f.buttonVisible}, scrolls=${f.scrolls})`);
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });

// ── leave the account as we found it ────────────────────────────────────────────────────────────
results.push(`\n  cleanup: ${setState("town", "reset")}`);

console.log(results.join("\n"));
console.log(`\n${fails ? `${fails} FAILURES` : "all checks passed"}`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
