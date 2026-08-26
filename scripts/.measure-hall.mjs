// What is actually eating the height in The Hall, measured in the page rather than guessed at.
// Usage: SHOT_COOKIE=<token> node scripts/.measure-hall.mjs [height=600]
import { spawn } from "node:child_process";

const H = Number(process.argv[2] || 600);
const URL_ = "https://www.wolfdengamingmn.com/marketplace/casino?at=bingo";
const port = 9411;
const chrome = spawn(process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [`--remote-debugging-port=${port}`, "--headless=new", "--no-first-run", "--disable-gpu", `--user-data-dir=${process.env.TEMP}/hallprobe`],
    { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(300);
    try {
        const r = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await r.json();
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Network.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: H, deviceScaleFactor: 2, mobile: true });
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
    domain: "www.wolfdengamingmn.com", path: "/", secure: true, sameSite: "Lax",
});
await send("Page.navigate", { url: URL_ });
await sleep(5000);

// Sit down.
await send("Runtime.evaluate", { expression: `document.querySelector(".cas-mach.is-near")?.click()` });
await sleep(2200);

const probe = `(() => {
  const q = (s) => document.querySelector(s);
  const h = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), mt: c.marginTop, mb: c.marginBottom, pb: c.paddingBottom }; };
  const stage = q(".cas-stage");
  return JSON.stringify({
    viewport: innerHeight,
    stage: h(".cas-stage"),
    scrollH: stage ? stage.scrollHeight : null,
    head: h(".cas-panel-head"),
    hall: h(".cas-hall"),
    caller: h(".cas-hall-top"),
    pattern: h(".cas-bpat"),
    bhead: h(".cas-bhead"),
    bcard: h(".cas-bcard"),
    controls: h(".cas-controls"),
    ctlVar: stage ? getComputedStyle(stage).getPropertyValue("--cas-ctl") : null,
    cell: q(".cas-bcell") ? Math.round(q(".cas-bcell").getBoundingClientRect().height) : null,
    overflow: stage ? stage.scrollHeight - stage.clientHeight : null,
  }, null, 1);
})()`;
const r = await send("Runtime.evaluate", { expression: probe, returnByValue: true });
console.log(`── ${375}x${H} ──`);
console.log(r?.result?.value || JSON.stringify(r?.exceptionDetails || r));
sock.close();
chrome.kill();
