// ── WHAT A REEL ACTUALLY DOES WHEN IT STOPS ──────────────────────────────────────────────────────────────────
// A throwaway diagnostic, written because I guessed at the slot cabinets' MOTION failure twice and was wrong
// twice. check:feel reports one number ("the stop peaks at 4.8x the run") and a number is not a diagnosis.
//
// This samples EVERY FRAME through a whole spin and prints the trace around each class flip: the strip's real
// translateY, which animation the browser thinks is running, and what the custom properties resolve to. If the
// strip jumps, the jump is in the trace with the frames either side of it.
//
//   SHOT_COOKIE=<token> node scripts/probe-reel-stop.mjs [at=slot] [port=9377]
import { spawn } from "node:child_process";

const AT = (process.argv.find((a) => a.startsWith("at=")) || "at=slot").slice(3);
const PORT = Number((process.argv.find((a) => a.startsWith("port=")) || "port=9377").slice(5));
const BASE = process.env.SHOT_BASE || "http://localhost:3000";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-probe-${PORT}`,
    "--autoplay-policy=no-user-gesture-required", "about:blank",
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
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
if (process.env.SHOT_COOKIE) {
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(BASE).hostname, path: "/", secure: false, sameSite: "Lax",
    });
}
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });

await send("Page.navigate", { url: `${BASE}/marketplace/casino?at=${AT}` });
await sleep(5000);
// Sit down at the machine.
await evaluate(`(() => { const b=[...document.querySelectorAll('.cas-mach')].find(x=>x.className.includes('is-near')); if(b) b.click(); return !!b; })()`);
await sleep(2500);

const SEL = process.argv.find((a) => a.startsWith("sel="))?.slice(4) || ".s5-reel:last-child";
const trace = await evaluate(`(() => {
  const SEL = ${JSON.stringify(SEL)};
  const reel = document.querySelector(SEL) || document.querySelector('.s5-reel');
  const strip = reel && (reel.querySelector('.s5-strip') || reel.querySelector('.col5-strip'));
  const go = [...document.querySelectorAll('button')].find(x => /^\\s*(spin|pull)\\s*$/i.test(x.textContent));
  if (!reel || !strip || !go) return JSON.stringify({ error: 'no reel or no button' });
  const rows = [];
  const t0 = performance.now();
  go.click();
  return new Promise(res => {
    const tick = () => {
      const cs = getComputedStyle(strip);
      const rs = getComputedStyle(reel);
      rows.push({
        t: Math.round(performance.now() - t0),
        y: Math.round(new DOMMatrixReadOnly(cs.transform).m42 * 10) / 10,
        cls: reel.className.replace('s5-reel', '').trim(),
        anim: cs.animationName,
        dur: cs.animationDuration,
        ease: cs.animationTimingFunction,
        // What the custom properties RESOLVE to, which is the thing I assumed and never checked.
        cell: rs.getPropertyValue('--s5cell').trim(),
        settle: rs.getPropertyValue('--settle').trim(),
        h: Math.round(reel.getBoundingClientRect().height * 10) / 10,
      });
      if (performance.now() - t0 < 9000) requestAnimationFrame(tick); else res(JSON.stringify(rows));
    };
    requestAnimationFrame(tick);
  });
})()`);

const rows = JSON.parse(trace || "[]");
if (rows.error) { console.log(rows.error); chrome.kill(); process.exit(1); }

console.log(`sampled ${rows.length} frames on ${AT}`);
console.log(`--s5cell resolves to: "${rows[0]?.cell}"   reel height: ${rows[0]?.h}px   --settle: "${rows[0]?.settle}"`);
console.log(`run animation: ${rows.find((r) => r.anim !== 'none')?.anim} ${rows.find((r) => r.anim !== 'none')?.dur} ${rows.find((r) => r.anim !== 'none')?.ease}`);

// The frames around every animation change — that is where a jump lives.
const marks = [];
for (let i = 1; i < rows.length; i += 1) if (rows[i].anim !== rows[i - 1].anim || rows[i].cls !== rows[i - 1].cls) marks.push(i);
console.log(`\nanimation/class changes at frames: ${marks.join(", ") || "none"}`);
for (const m of marks) {
    console.log(`\n── around frame ${m} ──`);
    for (let i = Math.max(0, m - 3); i <= Math.min(rows.length - 1, m + 4); i += 1) {
        const r = rows[i];
        const d = i > 0 ? (r.y - rows[i - 1].y).toFixed(1) : "—";
        console.log(`  f${String(i).padStart(3)} t=${String(r.t).padStart(4)}ms  y=${String(r.y).padStart(8)}  Δ=${String(d).padStart(8)}  ${r.anim} ${r.dur} [${r.cls}]`);
    }
}

// The biggest single-frame move in the whole spin, which is the kick check:feel is reporting.
let worst = { d: 0, i: 0 };
for (let i = 1; i < rows.length; i += 1) {
    const d = Math.abs(rows[i].y - rows[i - 1].y);
    if (d > worst.d) worst = { d, i };
}
console.log(`\nbiggest single-frame move: ${worst.d.toFixed(1)}px at frame ${worst.i} (t=${rows[worst.i]?.t}ms, ${rows[worst.i]?.anim})`);
chrome.kill();
