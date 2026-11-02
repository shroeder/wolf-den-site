// ── THE WAY BACK MUST NEVER COVER ANYTHING ──────────────────────────────────────────────────────────────────
// Luke, photographing it sitting on top of the Daily Quests list: "Thatd not how we want to get back we cant
// cover up stuff broseph."
//
// The door was `position: fixed` at the left edge, mid-height. That is a thing which lies on top of the page
// by construction, and no z-index or offset fixes it in general — a floating element that cannot see the
// content beneath it will cover something on some screen eventually. It is in the FLOW now: a slim bar that
// pushes the page down instead.
//
// So the test is not "does it look right on the quests page". It is the property:
//
//     the door's rectangle must not intersect any other visible element's rectangle.
//
// Checked across several pages including the one in the photograph.
//
//   SHOT_COOKIE=<token> node scripts/qa-return-door.mjs
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const PAGES = ["/marketplace/quests", "/marketplace/blacksmith", "/marketplace/farm", "/marketplace/store", "/marketplace"];

await requireDevServer(PORT);
const chrome = launchChrome(9364, "qa-door-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9364));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 200) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

let fails = 0;
const check = (ok, m) => { console.log(`  ${ok ? "✓" : "✗"} ${m}`); if (!ok) fails += 1; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });

// What the Grove would have left behind.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace` });
await waitFor(`document.readyState === "complete"`, 120);
await ev(`sessionStorage.setItem("wolfden-grove-return", JSON.stringify({href:"/marketplace/grove?view=town&town=3",label:"Fenhollow"}))`);

// ⚠️ TWO WIDTHS. The photograph is a phone; the fixed version also covered things on a laptop, and a bar in
// the flow has to behave at both or it has only moved the problem.
for (const [w, h, name] of [[390, 844, "phone 390"], [1280, 800, "desktop 1280"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    console.log(`\n── ${name} ──────────────────────────────────────────`);
    for (const p of PAGES) {
        await send("Page.navigate", { url: `http://localhost:${PORT}${p}` });
        const there = await waitFor(`!!document.querySelector(".gv-return-door")`, 200);
        if (!there) { console.log(`  · ${p} — no door (redirected or gated), skipped`); continue; }
        await sleep(1200);
        const r = await ev(`(() => {
            const d = document.querySelector(".gv-return-door");
            const dr = d.getBoundingClientRect();
            if (!dr.width || !dr.height) return JSON.stringify({ hidden: true });
            const pos = getComputedStyle(d).position;
            // Everything else on screen that paints: compare rectangles.
            const hits = [];
            for (const el of document.querySelectorAll("body *")) {
                if (el === d || d.contains(el) || el.contains(d)) continue;
                const s = getComputedStyle(el);
                if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue;
                const er = el.getBoundingClientRect();
                if (!er.width || !er.height) continue;
                // Only leaf-ish painted things — a wrapper legitimately contains the door's row.
                if (el.children.length > 2) continue;
                const overlap = Math.max(0, Math.min(dr.right, er.right) - Math.max(dr.left, er.left))
                              * Math.max(0, Math.min(dr.bottom, er.bottom) - Math.max(dr.top, er.top));
                if (overlap > 24) hits.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), overlap: Math.round(overlap) });
            }
            return JSON.stringify({ pos, top: Math.round(dr.top), h: Math.round(dr.height), w: Math.round(dr.width), hits: hits.slice(0, 4), n: hits.length });
        })()`);
        const d = JSON.parse(r);
        if (d.hidden) { console.log(`  · ${p} — door present but not painted`); continue; }
        check(d.pos !== "fixed", `${p.padEnd(26)} not fixed (${d.pos}), ${d.w}x${d.h} at y=${d.top}`);
        check(d.n === 0, `${p.padEnd(26)} covers nothing${d.n ? ` — ${d.n} overlap(s): ${JSON.stringify(d.hits)}` : ""}`);
    }
}

console.log(`\n${fails ? `${fails} FAILURES — the door is still covering content` : "the door never covers anything, on either width"}`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
