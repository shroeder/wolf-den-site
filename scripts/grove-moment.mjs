// ── WAIT FOR A MOMENT, THEN PHOTOGRAPH IT ────────────────────────────────────────────────────────────────────
// film.mjs samples on a fixed clock from a fixed start, which is right for judging an animation you can make
// happen on demand and wrong for one you have to WALK to. The boss notices the hero thirty-four units out,
// and under screencast the simulation runs several times slower than it does unobserved — so three sheets in
// a row were four seconds of a man walking, with the moment still ahead of the last frame every time.
//
// This polls for a selector instead and shoots the instant it appears, plus a couple of frames after.
//
//   node scripts/grove-moment.mjs "scene=bossin&zone=2" ".gv-boss-intro" out/boss-arrival
import { spawn } from "node:child_process";
import fs from "node:fs";

const QS = process.argv[2] || "scene=bossin&zone=2";
const SELECTOR = process.argv[3] || ".gv-boss-intro";
const OUT = process.argv[4] || "out/moment";
const PORT = 9420;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--no-first-run",
    `--user-data-dir=${process.env.TEMP}/cdp-moment-${PORT}`, "about:blank",
], { stdio: "ignore" });

let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up */ }
}
const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 620, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `http://localhost:3000/marketplace/grove/lab?${QS}` });

fs.mkdirSync("out", { recursive: true });
let shot = 0;
const grab = async (tag) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${OUT}-${tag}.png`, Buffer.from(s.data, "base64"));
    shot += 1;
};

// ⚠️ POLL, DO NOT SLEEP A FIXED AMOUNT. How long the hero takes to reach the boss depends on the frame rate
// the capture itself is imposing, which is the whole reason a fixed schedule kept missing it.
let seenAt = null;
for (let i = 0; i < 160; i += 1) {
    const st = await evaluate(`(() => {
        const w = window.__grove;
        const boss = w?.foes?.find((f) => f.isBoss);
        return {
            heroX: w ? Math.round(w.hero.x) : null,
            bossX: boss ? Math.round(boss.x) : null,
            gap: w && boss ? Math.round(Math.abs(boss.x - w.hero.x)) : null,
            noticed: Boolean(boss?.noticed),
            banner: Boolean(document.querySelector(${JSON.stringify(SELECTOR)})),
        };
    })()`);
    if (st?.banner && !seenAt) {
        seenAt = i;
        console.log(`banner up: ${JSON.stringify(st)}`);
        await grab("at");
    }
    if (seenAt !== null && i === seenAt + 3) { await grab("after"); break; }
    if (i % 20 === 0) console.log(`  ${i}: ${JSON.stringify(st)}`);
    await new Promise((r) => setTimeout(r, 180));
}
if (!seenAt) console.log("  never saw it — the moment did not happen inside the window");
console.log(`${shot} shot(s) -> ${OUT}-*.png`);

sock.close();
chrome.kill();
