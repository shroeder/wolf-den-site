// ── CAN YOU ACTUALLY SCROLL THIS PAGE ON A PHONE? ────────────────────────────────────────────────────────────
// A member: "Shop — I can not scroll down to see any description on phone. And that is a bug that makes
// stores feel sketchy."
//
// A screenshot cannot answer this. The capture rigs grab the FULL page, so a page that is impossible to
// scroll photographs exactly like a page that scrolls fine — which is how a report like this gets written off
// as "works for me". This drives a real viewport and asks the page three separate questions:
//
//   1. is there anything below the fold at all?
//   2. does the document say it may be scrolled (overflow on html/body, position:fixed height traps)?
//   3. and then ACTUALLY scroll it, with a real wheel event, and see whether the offset moved.
//
// (3) is the only one that is proof. See [[driving-a-browser-with-cdp]]: calling window.scrollTo is not a
// scroll any more than element.click() is a click — it bypasses the exact handlers that would block a user.
//
//   node scripts/scroll-probe.mjs <url> [width] [height]
import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const W = Number(process.argv[3] || 375);
const H = Number(process.argv[4] || 667);
const PORT = 9477;

if (!url) { console.log("usage: node scripts/scroll-probe.mjs <url> [w] [h]"); process.exit(0); }

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-scroll-${PORT}`,
    "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        const page = list.find((t) => t.type === "page");
        if (page) ws = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
    id += 1; pending.set(id, res);
    sock.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => (await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
// ⚠️ A REAL VIEWPORT, WITH mobile:true. Chrome clamps --window-size to ~500px and a desktop viewport at a
// phone WIDTH still reports desktop behaviour for touch handlers — which is where a scroll trap would live.
await send("Emulation.setDeviceMetricsOverride",
    { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url });
await sleep(4500);

const before = await evaluate("window.scrollY");
const metrics = await evaluate(`(() => {
    const d = document.documentElement, b = document.body;
    const cs = (el) => { const s = getComputedStyle(el); return { overflow: s.overflow, overflowY: s.overflowY, position: s.position, height: s.height, touchAction: s.touchAction }; };
    return {
        scrollHeight: d.scrollHeight, clientHeight: d.clientHeight,
        bodyScrollHeight: b.scrollHeight, bodyClass: b.className || "(none)",
        html: cs(d), body: cs(b),
        belowFold: d.scrollHeight - d.clientHeight,
    };
})()`);

// ⚠️ A REAL WHEEL EVENT, NOT window.scrollTo. The question is whether a USER can scroll, and scrollTo moves
// the offset even on a page whose handlers would swallow every gesture.
await send("Input.dispatchMouseEvent", {
    type: "mouseWheel", x: Math.round(W / 2), y: Math.round(H / 2), deltaX: 0, deltaY: 600,
});
await sleep(700);
const after = await evaluate("window.scrollY");

console.log(`\n${url}`);
console.log(`viewport ${W}x${H}, mobile emulation on\n`);
console.log(`  document   ${metrics.scrollHeight}px tall, viewport ${metrics.clientHeight}px`);
console.log(`  below fold ${metrics.belowFold}px`);
console.log(`  body class ${metrics.bodyClass}`);
console.log(`  html       overflow:${metrics.html.overflow} overflowY:${metrics.html.overflowY} position:${metrics.html.position} height:${metrics.html.height}`);
console.log(`  body       overflow:${metrics.body.overflow} overflowY:${metrics.body.overflowY} position:${metrics.body.position} height:${metrics.body.height} touch-action:${metrics.body.touchAction}`);
console.log(`\n  wheel down 600px:  scrollY ${before} -> ${after}`);
if (metrics.belowFold <= 0) console.log("  → nothing below the fold; there is nothing to scroll TO.");
else if (after > before) console.log("  → SCROLLS FINE. The page moved under a real wheel event.");
else console.log("  → ✗ DOES NOT SCROLL. There is content below the fold and the page would not move.");
console.log("");

sock.close();
chrome.kill();
