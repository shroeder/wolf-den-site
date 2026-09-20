// ── DOES THIS SCREEN WORK ON A WIDE, SHORT WINDOW? ───────────────────────────────────────────────────────────
// Luke, on an iPad in landscape: "many of the screens in our game have very low quality of life because you
// have to scroll up and down to click buttons and it feels like everything was tailored for a mobile screen."
//
// He is right, and the reason is a trap that no phone test can catch. A phone is TALL: 390x844. An iPad in
// landscape is WIDE and SHORT: 1194x744 once Safari's chrome is out of it, and a laptop is 1440x790. So a
// mobile-first single column that fits a phone perfectly has ~100px LESS height to work with on the bigger
// device, while leaving two thirds of the width empty. The screen got bigger and the game got harder to use.
//
// So this measures the two things that actually hurt, at three real viewports:
//
//   1. CONTROLS BELOW THE FOLD — how many buttons you must scroll to reach. This is the complaint, counted.
//      Anything inside a fixed/sticky element is excluded: it travels with you and is never "below" anything.
//   2. WASTED WIDTH — how much of the window the content does not use. A phone column centred in 1440px is
//      the other half of the same bug: the height problem exists BECAUSE the width is being thrown away.
//
// ⚠️ IT COMPARES AGAINST THE PHONE ON PURPOSE. "9 controls below the fold" means nothing on its own — the
// question is whether the big screen is WORSE than the small one, because that is the thing that is upside
// down. A page that scrolls on both is just a long page; a page that scrolls MORE on an iPad than on a phone
// is a layout that ignored the window it was given.
//
// Usage:
//   SHOT_COOKIE=<token> node scripts/landscape-audit.mjs [--routes a,b,c] [--out out/landscape.json]
//
// See [[visual-rigs]] for why this drives CDP rather than asking Chrome for a window size.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.AUDIT_BASE || "http://localhost:3000";
const PORT = 9400;

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : fallback;
};

// ── THE WINDOWS THAT MATTER ──────────────────────────────────────────────────────────────────────────────────
// Heights are the REAL usable ones, with browser chrome already subtracted — an iPad Pro is 834 tall and Safari
// takes ~90 of it. Measuring against the raw device height would flatter every page by a fold.
const VIEWPORTS = [
    { key: "phone", w: 390, h: 844, dsf: 2, mobile: true, label: "iPhone portrait" },
    { key: "ipad", w: 1194, h: 744, dsf: 2, mobile: true, label: "iPad Pro 11in landscape" },
    { key: "laptop", w: 1440, h: 790, dsf: 1, mobile: false, label: "Laptop 1440x900" },
];

// Every member-facing game screen. Labs and admin are excluded: they are dev tools, not places anybody plays.
const ROUTES = (arg("routes", "") || [
    "/marketplace",
    "/marketplace/play", "/marketplace/quests", "/marketplace/town", "/marketplace/guide",
    "/marketplace/inventory", "/marketplace/profile", "/marketplace/profile/avatar", "/marketplace/customize",
    "/marketplace/pets", "/marketplace/sets", "/marketplace/badges", "/marketplace/trophies",
    "/marketplace/arena", "/marketplace/boss", "/marketplace/dungeons", "/marketplace/mining",
    "/marketplace/fishing", "/marketplace/farm", "/marketplace/sailing", "/marketplace/cooking",
    "/marketplace/casino", "/marketplace/spin", "/marketplace/blacksmith", "/marketplace/jeweller",
    "/marketplace/cards", "/marketplace/cards/collection", "/marketplace/compendium",
    "/marketplace/market", "/marketplace/store", "/marketplace/auction", "/marketplace/trade",
    "/marketplace/vendors", "/marketplace/wants", "/marketplace/credit", "/marketplace/rewards",
    "/marketplace/leaderboard", "/marketplace/friends", "/marketplace/messages", "/marketplace/inbox",
    "/marketplace/notifications", "/marketplace/bounties", "/marketplace/creations", "/marketplace/events",
    "/marketplace/track", "/marketplace/changelog", "/marketplace/invite", "/marketplace/portal",
    "/marketplace/onboard", "/marketplace/apply", "/marketplace/vendor/me",
].join(",")).split(",").map((r) => r.trim()).filter(Boolean);

// ── THE PROBE ────────────────────────────────────────────────────────────────────────────────────────────────
// Runs in the page. Everything it reports is measured off real layout boxes at the real viewport; nothing here
// reads a stylesheet or guesses from a class name.
const PROBE = `(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const doc = document.documentElement;

    // Is this element carried by the viewport rather than by the document? A sticky footer's button is always
    // reachable, so counting it as "below the fold" would invent a problem that is not there.
    const travels = (el) => {
        for (let n = el; n && n !== doc; n = n.parentElement) {
            const p = getComputedStyle(n).position;
            if (p === "fixed" || p === "sticky") return true;
        }
        return false;
    };

    const visible = (el, r) => {
        if (r.width < 8 || r.height < 8) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
        return true;
    };

    const label = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.title || el.className || el.tagName)
        .toString().replace(/\\s+/g, " ").trim().slice(0, 34);

    // ── 1. THE CONTROLS YOU HAVE TO SCROLL TO ────────────────────────────────────────────────────────────
    const SEL = 'button, a[href], [role="button"], [role="tab"], input:not([type=hidden]), select, textarea, summary, [onclick]';
    const controls = [];
    for (const el of document.querySelectorAll(SEL)) {
        const r = el.getBoundingClientRect();
        if (!visible(el, r)) continue;
        if (travels(el)) continue;
        controls.push({ top: Math.round(r.top + window.scrollY), label: label(el) });
    }
    const below = controls.filter((c) => c.top >= vh);

    // ── 2. THE WIDTH NOBODY IS USING ─────────────────────────────────────────────────────────────────────
    // ⚠️ MEASURE THE CONTENT COLUMN, NOT THE EXTREMES OF THE PAGE. The first version took the leftmost and
    // rightmost inked element anywhere, which on the home screen is the game-nav pill bar — it runs the full
    // width, so the page reported "98% of the window used" while the content underneath sat in a 1100px
    // column with 340px of nothing on either side. The nav is not the layout; the column is.
    const shellEl = document.querySelector("main.content .shell, main.content, .shell");
    const shell = shellEl ? Math.round(shellEl.getBoundingClientRect().width) : 0;

    // How many blocks actually sit SIDE BY SIDE in the main stack. This is the whole question: a wider window
    // only helps if something moves into it. If this is 1 at 1440px, the page is a phone column on a desktop
    // and every extra pixel of width was spent on empty margin instead of on saving a fold of scrolling.
    const stack = document.querySelector("main.content .stack, main.content .shell > div, main.content > div");
    let columns = 0;
    if (stack) {
        const bands = new Map();
        for (const el of stack.children) {
            const r = el.getBoundingClientRect();
            if (!visible(el, r)) continue;
            const band = Math.round((r.top + window.scrollY) / 60);   // same 60px band = same row
            bands.set(band, (bands.get(band) || 0) + 1);
        }
        columns = bands.size ? Math.max(...bands.values()) : 0;
    }
    const span = shell;

    // ── 3. HORIZONTAL OVERFLOW ───────────────────────────────────────────────────────────────────────────
    const hOverflow = doc.scrollWidth > doc.clientWidth + 1;

    return {
        vw, vh,
        scrollHeight: Math.round(doc.scrollHeight),
        folds: Number((doc.scrollHeight / vh).toFixed(2)),
        controls: controls.length,
        below: below.length,
        belowLabels: below.slice(0, 6).map((c) => c.label),
        span, columns,
        usedWidth: vw ? Number((span / vw).toFixed(3)) : 0,
        hOverflow,
        title: (document.querySelector("h1")?.innerText || document.title || "").replace(/\\s+/g, " ").trim().slice(0, 48),
        signedOut: /sign in|log in|create an account/i.test(document.body.innerText.slice(0, 900)),
    };
})()`;

// ── CDP PLUMBING ─────────────────────────────────────────────────────────────────────────────────────────────
const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-audit-${PORT}`,
    "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up yet */ }
}
if (!wsUrl) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(wsUrl);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
if (process.env.SHOT_COOKIE) {
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(BASE).hostname, path: "/",
        secure: new URL(BASE).protocol === "https:", sameSite: "Lax",
    });
}
// Every launch card, check-in and push prompt out of the way — otherwise the rig measures the modal.
await installQuiet(send, { hide: quiet(null, QUIET_HIDE, ","), seen: quiet(null, QUIET_SEEN, ";") });

const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result?.value;

const results = [];
for (const route of ROUTES) {
    const row = { route, by: {} };
    for (const vp of VIEWPORTS) {
        await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dsf, mobile: vp.mobile });
        await send("Page.navigate", { url: `${BASE}${route}` });
        // ── ⚠️ WAIT FOR THE PAGE, NOT FOR THE CLOCK ──────────────────────────────────────────────────
        // A fixed settle measures whatever happened to be painted when it expired, and on a cold dev server
        // that is an empty shell — which reports "0 controls below the fold, 0% of the width used" and reads
        // exactly like a page that fits perfectly. The first run said precisely that about the inventory
        // screen on a laptop, which is one of the worst screens in the game. So: poll until the page has
        // actually rendered something, and SAY SO when it never does rather than returning a clean zero.
        let ready = false;
        for (let t = 0; t < 30 && !ready; t += 1) {
            await sleep(400);
            ready = await evaluate(`(document.body?.innerText || "").trim().length > 220 && document.readyState === "complete"`);
        }
        await sleep(Number(process.env.AUDIT_SETTLE) || 1400);   // let sprites and late panels land
        let m = null;
        try { m = await evaluate(PROBE); } catch { /* reported as null below */ }
        if (m && !ready) m.stalled = true;
        row.by[vp.key] = ready ? m : { ...(m || {}), stalled: true };
    }
    results.push(row);
    const p = row.by.phone, i = row.by.ipad, l = row.by.laptop;
    const f = (x) => (!x || x.stalled
        ? "   — never rendered —   "
        : `${String(x.below).padStart(2)} below /${String(x.folds).padStart(6)} folds /${String(Math.round((x.usedWidth || 0) * 100)).padStart(4)}% wide /${String(x.columns).padStart(2)} col`);
    console.log(`${route.padEnd(34)}  phone ${f(p)}   |  ipad ${f(i)}   |  laptop ${f(l)}`);
}

const out = arg("out", "out/landscape-audit.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ base: BASE, viewports: VIEWPORTS, results }, null, 2));
console.log(`\nwrote ${out}`);

sock.close();
chrome.kill();
