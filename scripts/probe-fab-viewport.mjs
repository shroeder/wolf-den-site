// ── IS THE CHAT BUTTON WHERE THE PERSON CAN SEE IT, WHEN THE TWO VIEWPORTS DISAGREE? ─────────────────────────
// Luke, from an iPad: "the chat button is bleeding off the bottom and right side, it's cut off."
//
// Every screenshot of it looked right, because Chrome's device emulation keeps the layout viewport and the
// visual viewport identical and `position: fixed` anchors to the LAYOUT one. On iOS they come apart — pinch a
// page, or let a browser bar draw over the bottom, and the corner the button is pinned to is off the screen.
//
// Emulation.setPageScaleFactor is a real pinch: it shrinks the visual viewport inside the layout viewport,
// which is the exact condition. This measures the button against what is actually visible, before and after.
//
//   node scripts/probe-fab-viewport.mjs [url] [w] [h] [scale]
import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2] || "http://localhost:3000/marketplace/town";
const W = Number(process.argv[3] || 820);
const H = Number(process.argv[4] || 1180);
const SCALE = Number(process.argv[5] || 2);
const PORT = 9411;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`,
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
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
const evalIn = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (process.env.SHOT_COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(url).hostname, path: "/", secure: new URL(url).protocol === "https:", sameSite: "Lax",
    });
}
await send("Page.navigate", { url });
await sleep(5000);

// Where the button is, against what is actually on screen. `visualViewport` is the visible rectangle; a
// button whose right edge is past it, or whose bottom is below it, is off the part of the page you can see.
const MEASURE = `(() => {
    const fab = document.querySelector(".social-fab");
    if (!fab) return { missing: true };
    const r = fab.getBoundingClientRect();
    const vv = window.visualViewport;
    return {
        scale: Number(vv.scale.toFixed(2)),
        visible: { w: Math.round(vv.width), h: Math.round(vv.height), x: Math.round(vv.offsetLeft), y: Math.round(vv.offsetTop) },
        fab: { right: Math.round(r.right), bottom: Math.round(r.bottom) },
        varRight: getComputedStyle(document.documentElement).getPropertyValue("--vv-inset-right").trim(),
        varBottom: getComputedStyle(document.documentElement).getPropertyValue("--vv-inset-bottom").trim(),
        offRight: Math.round(r.right - (vv.offsetLeft + vv.width)),
        offBottom: Math.round(r.bottom - (vv.offsetTop + vv.height)),
    };
})()`;

const before = await evalIn(MEASURE);
if (before?.missing) { console.error("probe: no .social-fab on the page — is the session signed in?"); sock.close(); chrome.kill(); process.exit(1); }
console.log(`\n  unzoomed   visible ${before.visible.w}x${before.visible.h}  fab right/bottom ${before.fab.right}/${before.fab.bottom}`
    + `  vars ${before.varRight || "unset"}/${before.varBottom || "unset"}  past the visible edge by ${before.offRight}/${before.offBottom}`);

// A real pinch. The layout viewport stays W x H; the visual viewport becomes W/scale x H/scale.
await send("Emulation.setPageScaleFactor", { pageScaleFactor: SCALE });
await sleep(900);
const after = await evalIn(MEASURE);
console.log(`  pinched ${SCALE}x  visible ${after.visible.w}x${after.visible.h}  fab right/bottom ${after.fab.right}/${after.fab.bottom}`
    + `  vars ${after.varRight || "unset"}/${after.varBottom || "unset"}  past the visible edge by ${after.offRight}/${after.offBottom}\n`);

sock.close();
chrome.kill();

// The whole point: after a pinch the button must still be inside what the person can see.
if (after.offRight > 0 || after.offBottom > 0) {
    console.error(`probe: pinched to ${SCALE}x the chat button is ${Math.max(0, after.offRight)}px past the right edge`
        + ` and ${Math.max(0, after.offBottom)}px past the bottom of what is on screen. That is the iPad report.`);
    process.exit(1);
}
console.log("probe: the chat button stays inside the visible viewport through a pinch.");
