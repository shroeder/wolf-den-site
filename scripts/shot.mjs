// ── SCREENSHOT ANY URL AT A REAL PHONE SIZE ──────────────────────────────────────────────────────────────────
// Every feature gets looked at on a phone AND on a wide screen before it is called done. This is the tool for
// the first half of that, and it exists because the obvious approach does not work:
//
//   THE TRAP: Chrome clamps --window-size to somewhere around 500px, so you cannot ask for a 375px viewport on
//   the command line — you will silently get ~500 and think you checked a phone. Emulation.setDeviceMetricsOverride
//   is the only thing that gives you the width you asked for. Node 22 ships WebSocket, so CDP needs no package.
//
//   THE SECOND TRAP: a page with no <meta name="viewport"> lays out at Chrome's 980px mobile fallback even
//   inside a 375px frame, so the shot looks like a phone and is not one. If window.innerWidth does not match
//   what you asked for, the page is lying to you and so is the screenshot.
//
//   THE THIRD TRAP: remote sprites arrive after load. Shooting immediately gives you a clean, empty, wrong
//   picture — hence the settle delay below.
//
//   THE FOURTH TRAP: half of what needs looking at is not on the page at load — a modal, an open panel, a
//   selected tab. Shooting the closed state and calling the feature checked is the same class of mistake as
//   shooting a 500px "phone". Hence the optional click selector below, which FAILS LOUDLY when it matches
//   nothing rather than quietly handing you a picture of the thing not open.
//
// Usage:
//   node scripts/shot.mjs <url> <out.png> [width=375] [height=667] [portOffset=0] [clickSelector] [waitForSelector]
//
// A file:// URL works, which is how a fixture page (one component, real sprite URLs, the app's real numbers)
// gets checked without standing up an authenticated session.
// cannot be produced that way — Emulation.setDeviceMetricsOverride is the only thing that actually gives you
// the viewport you asked for. Node 22 has WebSocket built in, so no dependency is needed.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const out = process.argv[3];
const W = Number(process.argv[4] || 375);
const H = Number(process.argv[5] || 667);
const PORT = 9333 + (Number(process.argv[6] || 0));
const CLICK = process.argv[7] || null;
const WAIT = process.argv[8] || null;   // what the click should have produced; the proof it actually landed

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

await send("Page.enable");
// THE ONE THAT MATTERS: a real 375-wide viewport, at 2x so the sprites are judged at phone pixel density.
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await sleep(2600); // let the remote sprites actually arrive — a blank shot proves nothing

// Open whatever state is being judged.
//
// THE CLICK MUST BE RETRIED, AND ITS RESULT MUST BE CHECKED. The element exists in the server-rendered HTML
// long before React attaches a handler to it, so a single well-timed .click() dispatches into nothing and the
// page sits there closed — and the screenshot comes out looking entirely reasonable. So: click, look for what
// the click was supposed to produce, click again. Nothing matching after the window is a hard failure rather
// than a picture of the thing not open.
if (CLICK) {
    await send("Runtime.enable");
    const evaluate = async (expression) =>
        (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;

    let opened = false;
    for (let i = 0; i < 20 && !opened; i += 1) {
        const state = await evaluate(`(() => {
            if (${JSON.stringify(!!WAIT)} && document.querySelector(${JSON.stringify(WAIT || "*")})) return "open";
            const el = document.querySelector(${JSON.stringify(CLICK)});
            if (!el) return "missing";
            el.click();
            return ${JSON.stringify(!!WAIT)} ? "clicked" : "open";
        })()`);
        if (state === "open") opened = true;
        else await sleep(400);
    }
    if (!opened) {
        console.error(`shot.mjs: ${CLICK} never produced ${WAIT || "a click"} — refusing to shoot the unopened page`);
        sock.close(); chrome.kill(); process.exit(1);
    }
    await sleep(800); // let the open animation land
}

const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(out, Buffer.from(data, "base64"));
console.log(`${out}  ${W}x${H}`);
sock.close();
chrome.kill();
process.exit(0);
