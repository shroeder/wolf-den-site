// ── WHAT IS ACTUALLY IN THE DOM WHERE A DROP SHOULD BE ───────────────────────────────────────────────────────
// A contact sheet shows you that something is missing; it cannot tell you whether the element is absent, empty,
// transparent, or sitting somewhere off the plate. This opens the lab, waits for loot to exist, and reports
// each drop's markup, its computed box, and whether its image actually decoded.
//
//   node scripts/grove-probe.mjs "http://localhost:3000/marketplace/grove/lab?scene=loot&zone=1"
import { spawn } from "node:child_process";
import fs from "node:fs";

const url = process.argv[2] || "http://localhost:3000/marketplace/grove/lab?scene=loot&zone=1";
const PORT = 9411;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${process.env.TEMP}/cdp-probe-${PORT}`, "about:blank",
], { stdio: "ignore" });

let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up yet */ }
}
if (!ws) { console.log("could not reach Chrome"); chrome.kill(); process.exit(1); }

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
const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 3000));

const report = await evaluate(`(async () => {
    // ⚠️ A DROP IS ON THE FLOOR FOR UNDER TWO SECONDS. Sampling at a fixed moment reported an empty zone and
    // read as "the element is never created", which is the opposite of the truth. Wait for one to exist.
    for (let i = 0; i < 60 && !document.querySelector(".gv-drop"); i += 1) {
        await new Promise((r) => setTimeout(r, 250));
    }
    const out = { drops: [], errors: [] };
    const nodes = [...document.querySelectorAll(".gv-drop")];
    out.count = nodes.length;
    for (const n of nodes.slice(0, 6)) {
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        const img = n.querySelector("img");
        const i = n.querySelector("i");
        const b = n.querySelector("b");
        const rec = {
            html: n.outerHTML.slice(0, 180),
            box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            display: cs.display, opacity: cs.opacity, transform: cs.transform.slice(0, 40),
            label: b ? b.textContent : null,
            labelOpacity: b ? getComputedStyle(b).opacity : null,
            hasImg: Boolean(img), hasStone: Boolean(i),
        };
        if (img) {
            const ir = img.getBoundingClientRect();
            rec.img = {
                src: img.getAttribute("src"),
                complete: img.complete,
                natural: img.naturalWidth + "x" + img.naturalHeight,
                box: [Math.round(ir.x), Math.round(ir.y), Math.round(ir.width), Math.round(ir.height)],
                opacity: getComputedStyle(img).opacity,
                display: getComputedStyle(img).display,
            };
        }
        out.drops.push(rec);
    }
    return out;
})()`);

console.log(JSON.stringify(
    report.drops.map((d) => ({ label: d.label, box: d.box, natural: d.img?.natural, decoded: d.img?.complete })),
    null, 2,
));

// ⚠️ AND A PICTURE OF THE EXACT BOX. The DOM report says the sprite is there, 69px and fully opaque; only
// the pixels it occupies can say whether it is LEGIBLE where it landed — a brown root on a brown path is
// present, correct, and invisible. See harness-must-reproduce-the-bug.
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/grove-drop-shot.png", Buffer.from(shot.data, "base64"));
console.log("out/grove-drop-shot.png  (deviceScaleFactor 2, so multiply the boxes above by 2)");

sock.close();
chrome.kill();
