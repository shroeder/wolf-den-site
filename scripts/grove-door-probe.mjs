// ── WHICH DOOR AM I LOOKING AT, AND WHAT DOES IT THINK IT IS? ────────────────────────────────────────────
// Two films of the unlock beat came back showing an already-open gate, which has at least three different
// causes that all look identical on a contact sheet: the fixture not banking the kills, the hero standing
// at the wrong end of the zone, or the kill landing before the first frame. Reading the DOM separates them.
//
//   node scripts/grove-door-probe.mjs "scene=unlock&zone=2"
import { spawn } from "node:child_process";
import fs from "node:fs";

const QS = process.argv[2] || "scene=unlock&zone=2";
const PORT = 9418;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--no-first-run",
    `--user-data-dir=${process.env.TEMP}/cdp-door-${PORT}`, "about:blank",
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 760, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `http://localhost:3000/marketplace/grove/lab?${QS}` });

const probe = `(() => {
    // ⚠️ THE LIVE WORLD, NOT JUST THE DOM. GroveScene parks the world object on window.__grove in the lab
    // for exactly this: "the hero is in the wrong place" and "the door is drawn in the wrong place"
    // photograph identically, and only the numbers tell them apart.
    const w = window.__grove;
    const world = w ? {
        heroX: Math.round(w.hero.x),
        doorXs: w.doors.map((d) => Math.round(d.x)),
        wall: Math.round(w.platforms.reduce((m, p) => Math.max(m, p.x + p.w), 0)),
        platforms: w.platforms.length,
        foes: w.foes.length,
        targetX: w.target ? Math.round(w.target.x) : null,
    } : null;
    const doors = [...document.querySelectorAll(".gv-door")];
    return { world, doors: doors.map((d) => {
        const r = d.getBoundingClientRect();
        const img = d.querySelector("img");
        const need = d.querySelector(".gv-door-need b");
        return {
            cls: d.className,
            aria: d.getAttribute("aria-label"),
            art: (img?.getAttribute("src") || "").split("/").pop(),
            toll: need ? need.textContent : null,
            x: Math.round(r.x), onScreen: r.right > 0 && r.left < window.innerWidth,
        };
    }) };
})()`;

for (const atMs of [600, 1200, 2500, 4000]) {
    await new Promise((r) => setTimeout(r, atMs === 600 ? 600 : atMs - 600));
    const v = (await send("Runtime.evaluate", { expression: probe, returnByValue: true })).result.value;
    console.log(`t+${atMs}ms`, JSON.stringify(v));
}

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("out/door-probe.png", Buffer.from(shot.data, "base64"));
sock.close();
chrome.kill();
