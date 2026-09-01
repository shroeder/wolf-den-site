// Drive the card fight with a real pointer and read the result out of the DOM. A screenshot proves a screen
// renders; it cannot prove that dragging a card onto a foe deals damage, and that is the entire interaction
// this slice exists to test.
import { spawn } from "node:child_process";

// EVERY PAGE IN THE DEN STARTS LIFE UNDERNEATH SOMETHING. A feature-launch modal (FeatureModal, fixed, inset 0,
// z-index 10060) was sitting over the whole fight and swallowing every pointer event — the drag looked broken
// and the game was fine. The screenshots did not show it because THEY ran with SHOT_QUIET and this did not.
import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";
import { writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_ = process.argv[2];
const OUT = process.argv[3];
const COOKIE = process.env.SHOT_COOKIE;
const PORT = 9455;
const W = 375, H = 441;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: new URL(URL_).hostname, path: "/", secure: false, sameSite: "Lax" });
}
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });
await send("Page.navigate", { url: URL_ });
await sleep(4200);

const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.data, "base64"));
};
const box = async (sel, nth = 0) => evalJs(`(() => { const e = document.querySelectorAll('${sel}')[${nth}]; if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
// What the screen SAYS, which is the only thing a player can act on.
const readout = async () => evalJs(`(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() || null;
    const hp = [...document.querySelectorAll('.cfb-hp')].map((e) => e.textContent.trim());
    return { hero: hp[0] || null, foe: hp[1] || null, energy: t('.cf-energy'), hand: document.querySelectorAll('.cf-hand .cf-card').length,
             draw: t('.cf-pile'), discard: [...document.querySelectorAll('.cf-pile')].pop()?.textContent?.trim() || null,
             intent: t('.cf-intent'), turn: t('.cf-turn'), tags: [...document.querySelectorAll('.cfb-tag')].map((e) => e.textContent.trim()) }; })()`);

const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse", ...extra });

console.log("BEFORE  ", JSON.stringify(await readout()));
await shot("1-before");

// ── THE DRAG ── press the third card (a Bite), pull it onto the foe, release.
const card = await box(".cf-hand .cf-card", 2);
const foe = await box(".cf-foe");
if (!card || !foe) { console.log("could not find card or foe box", { card, foe }); process.exit(1); }
await mouse("mousePressed", card.x, card.y);
for (let i = 1; i <= 8; i += 1) {
    await mouse("mouseMoved", card.x + ((foe.x - card.x) * i) / 8, card.y + ((foe.y - card.y) * i) / 8);
    await sleep(35);
}
await shot("2-middrag");
console.log("MIDDRAG ", JSON.stringify(await evalJs(`({ ghost: !!document.querySelector('.cf-drag'), aiming: !!document.querySelector('.cf-field.is-aiming'), lit: !!document.querySelector('.cf-foe.is-target') })`)));
await mouse("mouseReleased", foe.x, foe.y);
await sleep(260);
await shot("3-played");
console.log("PLAYED  ", JSON.stringify(await readout()));

// ── THE TAP PATH ── the half a mouse can do: tap a card, tap the foe.
const card2 = await box(".cf-hand .cf-card", 0);
await mouse("mousePressed", card2.x, card2.y);
await mouse("mouseReleased", card2.x, card2.y);
await sleep(120);
console.log("SELECTED", JSON.stringify(await evalJs(`({ picked: !!document.querySelector('.cf-card.is-picked') })`)));
// The picked card is the ANSWER to a fanned hand: a card whose right-hand end is covered by its neighbour has
// to become fully legible when you are considering it, or the overlap is just lost information.
await shot("3b-selected");
const foe2 = await box(".cf-foe");
await mouse("mousePressed", foe2.x, foe2.y);
await mouse("mouseReleased", foe2.x, foe2.y);
await sleep(260);
await shot("4-tapped");
console.log("TAPPED  ", JSON.stringify(await readout()));

// ── AND THE FOE'S TURN ──
await evalJs(`document.querySelector('.cf-end')?.click()`);
await sleep(300);
await shot("5-foeacting");
await sleep(900);
console.log("ENDED   ", JSON.stringify(await readout()));
await shot("6-afterfoe");

chrome.kill();
process.exit(0);
