// ── CAN YOU ACTUALLY PRESS IT ────────────────────────────────────────────────────────────────────────────
// ⚠️ A SCREENSHOT CANNOT SEE A HIT TEST, and that is how the event picker shipped unusable. Its cards had no
// width or height, so CardFace's absolutely positioned layers escaped their buttons and covered the buttons
// beside them — the point at the dead centre of a card belonged to its NEIGHBOUR. Every tap in that picker
// landed on the wrong card and nothing could ever be chosen. It had been photographed twice and looked
// perfect both times.
//
// So this asks the only question a picture cannot: for every control on a screen, is the thing at its own
// centre actually part of it? Anything that answers no is either unpressable or pressing something else.
//
// It also reports controls that are off-screen or zero-sized, which is the same class of fault reached from a
// different direction: a button nobody can put a thumb on.
//
// Usage:  SHOT_COOKIE=<token> node scripts/cards-hits.mjs [--w 375] [--h 667]
//   The run must already be standing where you want to look — see cards-rig.mjs stand/reward.
import { spawn } from "node:child_process";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const W = Number(arg("--w", 375));
const H = Number(arg("--h", 667));
const URL_ = arg("--url", "http://localhost:3000/marketplace/cards");
const PORT = Number(arg("--port", 9490));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-hits`, "about:blank",
], { stdio: "ignore" });
await sleep(1500);

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const waiting = new Map();
ws.onmessage = (ev) => {
    const m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
    const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});

await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Network.enable");
await send("Network.setCookies", { cookies: [{
    name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE, domain: "localhost", path: "/",
}] });
await send("Page.enable");
await send("Runtime.enable");
await installQuiet(send, {
    hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","),
    seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";"),
});

const js = async (expr) => (await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true,
}))?.result?.value;

await send("Page.navigate", { url: URL_ });
await sleep(5000);

// ── WHAT COUNTS AS A CONTROL ─────────────────────────────────────────────────────────────────────────────
// Anything a thumb is meant to land on. Disabled ones are still checked for POSITION (a disabled button in
// the wrong place is still a layout fault) but not for the hit test, since they intentionally take no input.
const report = await js(`(() => { try {
    const out = [];
    // ONLY THE GAME'S OWN CONTROLS. The Den's nav, its hidden giveaway link and whatever launch modal the
    // quiet list has display:none'd all live on the same document, and every one of them reports as zero-size
    // or covered — noise that buries the one real finding.
    // ⚠️ AND IT MUST NOT CRY WOLF, or it gets ignored the third time it runs. Two things look exactly like
    // faults and are the design working:
    //   A MODAL IS SUPPOSED TO COVER WHAT IS BEHIND IT. When the forge, the pickup panel or a card picker is
    //   up, the only controls that should be reachable are its own — so when one is open, that IS the screen.
    //   A LONG LIST IS SUPPOSED TO RUN PAST THE FOLD. The cabinet holds 123 cards; reporting a hundred of
    //   them as off-screen buries the one control that is off-screen and should not be.
    // .cf-over is the reward screen: it sits over the board and the hand behind it is SUPPOSED to be out of
    // reach until a card is taken.
    const modal = ['.frg', '.got', '.cv-pick-over', '.cr-pick-over', '.cs-pick', '.cf-over']
        .map((s) => document.querySelector(s)).find(Boolean);
    const roots = modal ? [modal]
        : ['.cf', '.cv', '.cr', '.cs', '.cm', '.cc', '.ct'].map((s) => document.querySelector(s)).filter(Boolean);
    const controls = roots.flatMap((root) => [...root.querySelectorAll('button, [role="button"], a[href]')]);
    // Is this control inside something that scrolls? Then being below the fold is reachable, not lost.
    const scrolls = (el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
            const st = getComputedStyle(n);
            if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 4) return true;
        }
        return document.scrollingElement && document.scrollingElement.scrollHeight > innerHeight + 4;
    };
    for (const el of controls) {
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 34)
            || el.className.toString().split(' ').filter((c) => !c.startsWith('jsx-')).join('.').slice(0, 34)
            || el.tagName;
        if (r.width < 2 || r.height < 2) { out.push({ label, why: 'zero size' }); continue; }
        const off = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
        if (off) {
            if (!scrolls(el)) out.push({ label, why: 'off screen, cannot scroll to it' });
            continue;
        }
        if (el.disabled) continue;
        // Clamped into the viewport so a control half off the fold is judged on the half you can reach.
        const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
        const hit = document.elementFromPoint(x, y);
        if (!hit) { out.push({ label, why: 'nothing at its centre' }); continue; }
        if (!el.contains(hit) && !hit.contains(el)) {
            const who = (hit.className.toString().split(' ').filter((c) => !c.startsWith('jsx-')).join('.')
                || hit.tagName).slice(0, 30);
            // A FIXED control over a SCROLLING list is not a fault. The cabinet's Return ribbon sits in the
            // bottom-left corner and whichever card happens to be under it right now is one flick away —
            // which is how every fixed footer in this game works, and reporting it buries the real ones.
            let fixed = false;
            for (let m = hit; m; m = m.parentElement) {
                if (getComputedStyle(m).position === 'fixed') { fixed = true; break; }
            }
            if (!(fixed && scrolls(el))) out.push({ label, why: 'covered by ' + who });
        }
        // A touch target under 32px is a miss waiting to happen on a phone.
        if (Math.min(r.width, r.height) < 24) {
            out.push({ label, why: 'tiny target ' + Math.round(r.width) + 'x' + Math.round(r.height) });
        }
    }
    return JSON.stringify({ n: controls.length, out });
    } catch (e) { return JSON.stringify({ n: 0, out: [{ label: String(e && e.message), why: 'AUDIT THREW' }] }); }
})()`);

const { n, out } = JSON.parse(report || '{"n":0,"out":[]}');
const where = await js(`document.querySelector('.cf-field') ? 'fight'
    : document.querySelector('.cv') ? 'event' : document.querySelector('.cr') ? 'room'
    : document.querySelector('.cs') ? 'shop' : document.querySelector('.cm') ? 'map'
    : document.querySelector('.cc') ? 'collection' : document.querySelector('.ct') ? 'table' : 'unknown'`);

console.log(`  ${where.padEnd(11)} ${W}x${H}  ${n} controls, ${out.length} problem(s)`);
for (const p of out) console.log(`     ${p.why.padEnd(26)} ${p.label}`);

ws.close();
chrome.kill();
process.exit(out.length ? 1 : 0);
