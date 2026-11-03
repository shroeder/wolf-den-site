// ── HOW FAR ABOVE THE PLANK IS EVERYBODY, IN PIXELS ─────────────────────────────────────────────────────────
// Luke: "We're like walking on air, and the enemies are like walking on air on the platforms. It feels like
// the physics aren't lined up properly with the platforms."
//
// "Feels like" is the problem with judging this from a screenshot: a contact a few pixels out reads instantly
// as weightlessness, and every number in the code is correct. check:slabs already proved the slab table
// matches the art, so the error is somewhere between the surface and the body. This measures the gap.
//
// For every body standing in the zone it reports the distance from the BOTTOM of its box to the TOP of the
// ledge it is over — and separately the top of the ledge's PAINTED surface, since those are different things
// (SLAB_SURFACE exists because the element's top edge is the tip of the tallest moss tuft).
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-footing.mjs [zoneCardIndex]
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const ZONE_INDEX = Number(process.argv[2] || 1);

await requireDevServer(PORT);
const chrome = launchChrome(9362, "qa-footing-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9362));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
// Landscape, like the phone in the photograph.
// ⚠️ THE SIZE IN THE PHOTOGRAPH. Luke plays in landscape on a phone whose screenshots are ~2000px wide;
// every measurement before this ran at 900x420 and found nothing, which is the whole reason the float was
// never reproduced. [[landscape-is-wider-than-your-phone-breakpoint]] is the same scar from the other side.
const VW = Number(process.env.VW || 2000), VH = Number(process.env.VH || 900);
await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: true });
console.log(`viewport ${VW}x${VH}`);
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
await waitFor(`document.body.classList.contains("gv-full-lock")`, 240);
await ev(`(() => {
    const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[${ZONE_INDEX}]?.click();
})()`);
if (!await waitFor(`!!document.querySelector(".gv-hero")`, 200)) { console.log("never entered a zone"); process.exit(1); }
await sleep(4000);

// ⚠️ MEDIAN OVER FRAMES, NOT ONE FRAME. Every body breathes a few percent and the hero bobs, so a single
// sample answers a 4px question with an 8px number — the exact mistake the last footing fix made.
const samples = await ev(`(async () => {
    const take = () => {
        const ledges = [...document.querySelectorAll(".gv-ledge, .gv-slab")].map((e) => {
            const r = e.getBoundingClientRect();
            const surf = parseFloat(getComputedStyle(e).getPropertyValue("--gv-slab-surface")) || null;
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, surf };
        });
        const body = (sel, name) => [...document.querySelectorAll(sel)].map((e, i) => {
            const r = e.getBoundingClientRect();
            if (!r.width) return null;
            const cx = r.left + r.width / 2;
            // The ledge this body is standing over: the highest one whose span contains it and whose top is
            // at or below the feet (within a tolerance for the float we are measuring).
            // ⚠️ A WIDE WINDOW ON PURPOSE. The first version only matched a ledge within 40px of the feet,
            // which silently EXCLUDED exactly the bodies that are floating — the thing being measured. A
            // detector whose tolerance is the size of the defect reports the defect as absent.
            const under = ledges.filter((L) => cx >= L.left && cx <= L.right && L.top >= r.bottom - 220)
                .sort((a, b) => a.top - b.top)[0];
            if (under) return { who: name + (i || ""), on: "ledge", gap: Math.round((under.top - r.bottom) * 10) / 10 };
            // Nobody over a ledge is standing on the zone floor; measure against that instead so the body
            // is never simply missing from the report.
            const ground = document.querySelector(".gv-world")?.getBoundingClientRect();
            return { who: name + (i || ""), on: "ground", gap: ground ? Math.round((ground.bottom - r.bottom) * 10) / 10 : null };
        }).filter(Boolean);
        return [...body(".gv-hero", "hero"), ...body(".gv-pet", "pet"), ...body(".gv-foe", "foe"), ...body(".gv-npc", "npc")];
    };
    const runs = [];
    for (let i = 0; i < 12; i++) { runs.push(take()); await new Promise((r) => setTimeout(r, 120)); }
    const byWho = {};
    const whereOn = {};
    for (const run of runs) {
        for (const b of run) { (byWho[b.who] ||= []).push(b.gap); whereOn[b.who] = b.on; }
    }
    return JSON.stringify(Object.entries(byWho).map(([who, gaps]) => {
        gaps.sort((a, b) => a - b);
        return { who, on: whereOn[who], median: gaps[Math.floor(gaps.length / 2)], min: gaps[0], max: gaps[gaps.length - 1], n: gaps.length };
    }));
})()`);

console.log(`\nledges on screen: ${await ev(`document.querySelectorAll(".gv-ledge, .gv-slab").length`)}`);
console.log(`gap = pixels between the BOTTOM of the body's box and the TOP of the ledge element under it.`);
console.log(`positive = floating above it, negative = sunk into it.\n`);
const rows = JSON.parse(samples || "[]");
if (!rows.length) console.log("  (nobody is standing over a ledge right now)");
for (const r of rows) {
    const verdict = Math.abs(r.median) <= 4 ? "✓ planted" : r.median > 0 ? "✗ FLOATING" : "✗ sunk";
    console.log(`  ${verdict.padEnd(12)} ${r.who.padEnd(7)} on ${String(r.on).padEnd(6)} median ${String(r.median).padStart(7)}px   (min ${r.min}, max ${r.max}, ${r.n} frames)`);
}
// The slab's own painted surface, for comparison: the element's top edge is the tip of the tallest tuft.
console.log(`\n  --gv-slab-surface on the first ledge: ${await ev(`(() => { const e=document.querySelector(".gv-ledge, .gv-slab"); return e ? getComputedStyle(e).getPropertyValue("--gv-slab-surface") || "(not set)" : "none"; })()`)}`);
ws.close(); chrome.kill();
process.exit(0);
