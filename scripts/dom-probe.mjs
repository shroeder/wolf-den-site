// ── ASK THE PAGE, INSTEAD OF GUESSING FROM THE PICTURE ───────────────────────────────────────────────────────
// A screenshot says "it is not there". It does not say whether the element was never rendered, rendered with a
// zero box, painted behind something, or parked off screen — and those want four different fixes. This runs one
// expression in a real signed-in page and prints what came back.
//
//   SHOT_COOKIE=<token> node scripts/dom-probe.mjs <url> "<expression>" [width] [height]
import { spawn } from "node:child_process";
import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const expression = process.argv[3];
const W = Number(process.argv[4] || 1194);
const H = Number(process.argv[5] || 900);
const PORT = 9610;
if (!url || !expression) throw new Error('usage: dom-probe.mjs <url> "<expression>" [w] [h]');

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", `--user-data-dir=${process.env.TEMP}/cdp-probe-${PORT}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 120 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }
const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0; const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
if (process.env.SHOT_COOKIE) {
    await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(url).hostname, path: "/", secure: new URL(url).protocol === "https:", sameSite: "Lax" });
}
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });
await send("Page.navigate", { url });
for (let t = 0; t < 40; t += 1) {
    await sleep(400);
    const ready = (await send("Runtime.evaluate", { expression: `document.readyState === "complete" && (document.body?.innerText||"").length > 200`, returnByValue: true }))?.result?.value;
    if (ready) break;
}
await sleep(Number(process.env.PROBE_SETTLE) || 2600);

const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
if (r?.exceptionDetails) {
    console.error("THREW:", r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    sock.close(); chrome.kill(); process.exit(1);
}
console.log(JSON.stringify(r?.result?.value, null, 1));
sock.close(); chrome.kill();
