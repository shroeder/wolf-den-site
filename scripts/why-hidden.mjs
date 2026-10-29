// ── WHY IS THIS ELEMENT NOT ON SCREEN? ───────────────────────────────────────────────────────────────────────
// A selector that matches and a thing you can see are different claims, and the gap between them is where this
// codebase keeps losing an afternoon: a panel that is "open" by every state check and invisible by every other
// measure. [[filter-creates-containing-block]] is one way it happens, there are several others, and none of
// them throws anything.
//
// So: open the page, click whatever opens the thing, then interrogate the element itself — its box, its
// computed style, and every ANCESTOR that could be hiding it. Prints the first cause it finds rather than a
// dump to read through.
//
//   node scripts/why-hidden.mjs <url> <selector> [clickSelector] [w] [h] [cookie]
import { spawn } from "node:child_process";

import { installMock, reportMock } from "./lib/shot-mock.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [, , url, sel, clickSel, wArg, hArg] = process.argv;
const W = Number(wArg || 390);
const H = Number(hArg || 844);
const PORT = 9488;
if (!url || !sel) { console.log("usage: node scripts/why-hidden.mjs <url> <selector> [click] [w] [h]"); process.exit(0); }

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-why-${PORT}`,
    "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* not up */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }
const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0; const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { id += 1; pending.set(id, res); sock.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (process.env.SHOT_COOKIE) {
    await send("Network.enable");
    const u = new URL(url);
    await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE, domain: u.hostname, path: "/" });
}
// SHOT_MOCK=<fixture.json> — answer the page's own fetches, so a state that only exists on the server can
// be put in front of this script. Same table format the shot and film rigs use; see lib/shot-mock.mjs.
if (process.env.SHOT_MOCK) {
    const { readFileSync } = await import("node:fs");
    await installMock(send, JSON.parse(readFileSync(process.env.SHOT_MOCK, "utf8")));
}
await send("Page.navigate", { url });
await sleep(5000);

if (clickSel) {
    await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(clickSel)});
        if (!el) return "missing";
        for (const t of ["pointerdown", "pointerup"]) el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true }));
        el.click();
        return "clicked";
    })()`);
    await sleep(1600);
}

const report = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const causes = [];
    if (r.width === 0 || r.height === 0) causes.push("the element's own box is " + Math.round(r.width) + "x" + Math.round(r.height));
    if (cs.display === "none") causes.push("display:none on the element");
    if (cs.visibility === "hidden") causes.push("visibility:hidden on the element");
    if (Number(cs.opacity) === 0) causes.push("opacity:0 on the element");
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)
        causes.push("positioned outside the viewport at " + Math.round(r.left) + "," + Math.round(r.top));
    // ⚠️ THE ANCESTORS ARE THE POINT. A panel is usually fine and its PARENT is the problem — a transform or
    // filter on an ancestor turns position:fixed into position:absolute-within-that-ancestor, which is the
    // bug this codebase has shipped before and cannot be seen by looking at the panel alone.
    const anc = [];
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const s = getComputedStyle(p);
        const bad = [];
        if (s.display === "none") bad.push("display:none");
        if (s.visibility === "hidden") bad.push("visibility:hidden");
        if (Number(s.opacity) === 0) bad.push("opacity:0");
        if (s.transform !== "none") bad.push("transform:" + s.transform.slice(0, 28));
        if (s.filter !== "none") bad.push("filter:" + s.filter.slice(0, 24));
        if (s.overflow !== "visible") bad.push("overflow:" + s.overflow);
        if (bad.length) anc.push((p.tagName.toLowerCase() + "." + String(p.className || "").split(" ").filter(Boolean).slice(0, 2).join(".")) + "  → " + bad.join(", "));
    }
    // What is actually painted at the element's centre — the only test that cannot be argued with.
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    return {
        found: true,
        box: Math.round(r.width) + "x" + Math.round(r.height) + " at " + Math.round(r.left) + "," + Math.round(r.top),
        style: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, position: cs.position, zIndex: cs.zIndex, transform: cs.transform.slice(0, 30) },
        causes,
        ancestors: anc,
        topmostAtCentre: hit ? (hit.tagName.toLowerCase() + "." + String(hit.className || "").split(" ").filter(Boolean).slice(0, 2).join(".")) : null,
        isSelfOrInside: hit ? (hit === el || el.contains(hit)) : false,
    };
})()`);

console.log("\n" + sel + (clickSel ? `  (after clicking ${clickSel})` : ""));
if (!report?.found) console.log("  NOT IN THE DOM AT ALL.");
else {
    console.log("  box        " + report.box);
    console.log("  style      " + JSON.stringify(report.style));
    console.log("  at centre  " + report.topmostAtCentre + (report.isSelfOrInside ? "   ← this IS the element, so it is visible" : "   ← something else is on top"));
    console.log(report.causes.length ? "  CAUSES     " + report.causes.join(" · ") : "  no cause found on the element itself");
    if (report.ancestors.length) {
        console.log("  ancestors that could hide it:");
        for (const a of report.ancestors) console.log("    " + a);
    } else console.log("  no ancestor is hiding it");
}
// ⚠️ AND IT CAN TAKE THE PICTURE ITSELF. When this script proves an element IS visible but the shot rig
// photographed it missing, the fastest way out is to shoot from the context that already has it right —
// same viewport, same click, same settle. SHOT_OUT=<path>.
if (process.env.SHOT_OUT) {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.SHOT_OUT, Buffer.from(data, "base64"));
    console.log("  shot -> " + process.env.SHOT_OUT);
}
if (process.env.SHOT_MOCK) await reportMock(evaluate);
console.log("");
sock.close(); chrome.kill();
