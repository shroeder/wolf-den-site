// ── DO THE SKILL EFFECTS ACTUALLY FIRE, IN THE GAME, WITH THEIR ART ─────────────────────────────────────────
// Luke: "I cannot see the skills happening... I want to actually like see like a unique effect, bro."
// And on the process: "Why not intensively test and iterate without me."
//
// scripts/fx-sheet.mjs proves the LOOK — nine stages, real GROVE_CSS, no game. That is a lab, and a lab
// proves the component, never the wiring. Everything it cannot see has bitten this feature already:
//
//   · skillFx is called with a shape the map does not know        -> no node at all
//   · the node is created but the art path 404s                   -> an empty box, silently
//   · a stylesheet !important outranks the image                  -> an empty box, silently (this happened)
//   · the effect fires somewhere the camera is not                -> invisible, and nothing is wrong
//
// So this watches the REAL zone and records every .gv-sfx the game creates: which shape, whether it claims
// painted art, and whether that image actually DECODED in the browser. An image that fails to load reports
// naturalWidth 0, which is the one check that distinguishes "drew the art" from "drew an empty box".
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-skillfx.mjs [zoneCardIndex]
import { writeFileSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const ZONE_INDEX = Number(process.argv[2] || 1);
const FIGHT_MS = Number(process.env.FIGHT_MS || 26000);

if (!COOKIE) { console.log("no SHOT_COOKIE — mint one with scripts/_mint-shot-session.mjs"); process.exit(1); }
await requireDevServer(PORT);
const chrome = launchChrome(9372, "qa-skillfx-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9372));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
// ⚠️ LANDSCAPE AND WIDE, like the phone Luke plays on. qa-grove-footing learned this the hard way: every
// measurement at 900x420 found nothing because that is not the shape of his screen.
await send("Emulation.setDeviceMetricsOverride", { width: 2000, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
if (!await waitFor(`document.body.classList.contains("gv-full-lock")`, 240)) { console.log("never reached the Grove — is the account gated?"); process.exit(1); }
await ev(`(() => {
    const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[${ZONE_INDEX}]?.click();
})()`);
if (!await waitFor(`!!document.querySelector(".gv-hero")`, 200)) { console.log("never entered a zone"); process.exit(1); }
await sleep(3500);

// ── the observer ────────────────────────────────────────────────────────────────────────────────────────
// Installed BEFORE any fighting, on the layer itself, because these nodes live ~400ms and polling for them
// is a race that reports zero and reads like "no effects exist".
await ev(`(() => {
    window.__fx = { seen: [], err: [] };
    const layer = document.querySelector(".gv-fx") || document.querySelector(".gv-world") || document.body;
    window.__fxLayer = layer ? layer.className : "(none)";
    const note = (n) => {
        if (!(n instanceof HTMLElement) || !n.classList.contains("gv-sfx")) return;
        const shape = [...n.classList].find((c) => c.startsWith("is-"))?.slice(3) || "(none)";
        const hasArt = n.classList.contains("has-art");
        const cs = getComputedStyle(n);
        const bg = cs.backgroundImage;
        const rec = { shape, hasArt, bg: bg === "none" ? "none" : "url", loaded: null,
            w: Math.round(n.getBoundingClientRect().width), anim: cs.animationName, blend: cs.mixBlendMode };
        window.__fx.seen.push(rec);
        // Did the bitmap actually decode? A 404 or a bad path leaves background-image SET and draws nothing,
        // which is exactly the failure this rig exists to tell apart from a working effect.
        const m = /url\\("?([^")]+)"?\\)/.exec(bg);
        if (m) { const img = new Image(); img.onload = () => { rec.loaded = img.naturalWidth > 0; };
                 img.onerror = () => { rec.loaded = false; window.__fx.err.push(m[1]); }; img.src = m[1]; }
    };
    new MutationObserver((muts) => { for (const mu of muts) for (const n of mu.addedNodes) note(n); })
        .observe(layer, { childList: true, subtree: true });
    return true;
})()`);
console.log(`watching layer: ${await ev("window.__fxLayer")}`);

// ── fight ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ A REAL POINTER, NOT element.click(). The Grove targets on pointerdown; a synthetic click fires none of
// that and the rig would sit there reporting an empty zone. [[driving-a-browser-with-cdp]]
const tapAt = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "touch" });
    }
};
const foeAt = async () => JSON.parse(await ev(`(() => {
    const f = [...document.querySelectorAll(".gv-foe")].map((e) => e.getBoundingClientRect())
        .filter((r) => r.width && r.left > 40 && r.right < innerWidth - 40 && r.top > 0)
        .sort((a, b) => Math.abs(a.left - innerWidth / 2) - Math.abs(b.left - innerWidth / 2))[0];
    return JSON.stringify(f ? { x: Math.round(f.left + f.width / 2), y: Math.round(f.top + f.height / 2) } : null);
})()`) || "null");

const started = Date.now();
let taps = 0, kills = 0;
const hp0 = await ev(`document.querySelectorAll(".gv-foe").length`);
while (Date.now() - started < FIGHT_MS) {
    const f = await foeAt();
    if (f) { await tapAt(f.x, f.y); taps += 1; }
    else {
        // Nothing in reach: walk right so the rig does not stand still in an empty stretch for 26 seconds.
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
        await sleep(700);
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
    }
    await sleep(850);
}
kills = Math.max(0, hp0 - (await ev(`document.querySelectorAll(".gv-foe").length`)));
await sleep(600);

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────
const out = JSON.parse(await ev(`JSON.stringify(window.__fx)`) || `{"seen":[],"err":[]}`);
const seen = out.seen || [];
const by = {};
for (const r of seen) {
    const k = by[r.shape] ||= { n: 0, art: 0, loaded: 0, failed: 0, pending: 0, blend: r.blend, anim: r.anim, w: r.w };
    k.n += 1;
    if (r.hasArt) k.art += 1;
    if (r.loaded === true) k.loaded += 1; else if (r.loaded === false) k.failed += 1; else if (r.hasArt) k.pending += 1;
}
let fails = 0;
const check = (ok, m) => { console.log(`  ${ok ? "✓" : "✗"} ${m}`); if (!ok) fails += 1; };

console.log(`\n${taps} taps, ~${kills} fewer creatures on screen, ${seen.length} skill effects created\n`);
console.log("  shape      fired   painted   decoded   FAILED   width   animation");
for (const [shape, k] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${shape.padEnd(10)} ${String(k.n).padStart(5)}   ${String(k.art).padStart(7)}   ${String(k.loaded).padStart(7)}`
        + `   ${String(k.failed).padStart(6)}   ${String(k.w).padStart(5)}   ${k.anim}`);
}
console.log("");
check(seen.length > 0, `skill effects fire at all (${seen.length})`);
const failed = seen.filter((r) => r.loaded === false).length;
check(failed === 0, `every painted effect decoded its image${failed ? ` — ${failed} FAILED: ${[...new Set(out.err)].join(", ")}` : ""}`);
const emptyBox = seen.filter((r) => r.hasArt && r.bg === "none").length;
check(emptyBox === 0, `no effect claims painted art but has no background-image${emptyBox ? ` — ${emptyBox} empty boxes` : ""}`);
const wrongBlend = seen.filter((r) => r.hasArt && r.blend !== "screen").length;
check(wrongBlend === 0, `painted art composites with screen blend${wrongBlend ? ` — ${wrongBlend} did not` : ""}`);
const noAnim = seen.filter((r) => !r.anim || r.anim === "none").length;
check(noAnim === 0, `every effect has an animation${noAnim ? ` — ${noAnim} had none, so they would hang on screen` : ""}`);
const zeroW = seen.filter((r) => !r.w).length;
check(zeroW === 0, `every effect has a real width${zeroW ? ` — ${zeroW} measured 0px` : ""}`);

const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("scripts/_fx-in-game.png", Buffer.from(data, "base64"));
console.log(`\n  shot scripts/_fx-in-game.png`);
console.log(fails ? `\n${fails} FAILURES` : `\nthe effects fire in the real zone, with their art, and it decodes.`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
