// ── WHAT THE BAG ACTUALLY LOOKS LIKE, SIGNED IN ──────────────────────────────────────────────────────────────
// The bag and the workbench live in GroveClient, which the lab does not mount — the lab is the SCENE only. So
// the one way to see whether a part reads as itself in a slot is to open the real page as a real member who
// really owns parts, which is what this does: find a buyer with grove items, mint a throwaway session, print
// the cookie for the film rig, and clean up afterwards.
//
//   node scripts/grove-bag-shot.mjs
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const OUT = "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/91a0a3af-00e8-4dd6-a43b-f309eb47b2cc/scratchpad";
const PORT = 9419;
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^"|"$/g, ""));

// ⚠️ A MEMBER WHO OWNS SOMETHING, not just any member. An empty bag renders "Empty. Go and kill something."
// and photographs as a working page with no icons in it, which is indistinguishable from the icons failing.
const who = await sql`SELECT buyer_id, COUNT(*)::int AS kinds, SUM(qty)::int AS total
                        FROM mkt_grove_item WHERE qty > 0
                       GROUP BY buyer_id ORDER BY kinds DESC LIMIT 1`;
if (!who.length) { console.log("nobody owns any grove parts yet — nothing to photograph"); process.exit(0); }
const buyerId = who[0].buyer_id;
console.log(`buyer ${buyerId}: ${who[0].kinds} kinds, ${who[0].total} parts`);

const token = crypto.randomBytes(32).toString("hex");
const hash = crypto.createHash("sha256").update(token).digest("hex");
await sql`INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
          VALUES (${buyerId}, ${hash}, 'grove-bag-shot', NOW() + INTERVAL '15 minutes')`;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--no-first-run",
    `--user-data-dir=${process.env.TEMP}/cdp-bag-${PORT}`, "about:blank",
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
await send("Network.enable");
await send("Network.setCookie", {
    name: "wolfden-mkt-buyer-session", value: token, domain: "localhost", path: "/",
});
// ⚠️ SEED THE "ALREADY SEEN THIS" MARKERS AND HIDE THE SCRIMS, or the shot is of whichever launch card
// this account has never dismissed. The first three runs clicked straight into an IMG.mkl-art — the
// Market launch modal — and reported zero slots, which photographs exactly like the icons having failed.
// shot-quiet exists for this and film.mjs already uses it; there is no reason for a second answer.
await installQuiet(send, { hide: quiet("", QUIET_HIDE, ","), seen: quiet("", QUIET_SEEN, ";") });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: "http://localhost:3000/marketplace/grove" });
await new Promise((r) => setTimeout(r, 11000));

// ⚠️ THE MAP FIRST. It is the main screen now, so a rig that only ever photographs the bag can tell you
// nothing about the screen the player actually lands on.
{
    // ⚠️ MEASURED HERE, NOT AT THE END. The map is gone the moment the bag is opened, so a measurement
    // taken after the click reports null for every element of the screen it was supposed to be checking.
    const am = await send("Runtime.evaluate", { expression: `(() => {
        const a = document.querySelector(".gv-area");
        const sh = document.querySelector(".gv-sheet");
        const st = document.querySelector(".gv-strip");
        const r = a?.getBoundingClientRect();
        return {
            vh: window.innerHeight,
            card: r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null,
            cardCss: a ? getComputedStyle(a).height : null,
            sheet: sh ? Math.round(sh.getBoundingClientRect().height) : null,
            strip: st ? Math.round(st.getBoundingClientRect().height) : null,
        };
    })()`, returnByValue: true });
    console.log("map:", JSON.stringify(am.result.value));

    const m = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: 900, scale: 2 } });
    fs.writeFileSync(`${OUT}/grove-map.png`, Buffer.from(m.data, "base64"));
    console.log(`${OUT}/grove-map.png`);
}

// The bag is behind a button on the dock's own nav; press it like a finger would.
const found = await send("Runtime.evaluate", {
    expression: `(() => {
        const b = [...document.querySelectorAll(".gv-dock button")].find((x) => /bag|pack/i.test(x.getAttribute("aria-label") || ""));
        if (!b) return { ok: false, tabs: [...document.querySelectorAll(".gv-dock button")].map((x) => x.getAttribute("aria-label")) };
        // ⚠️ SCROLL FIRST, THEN MEASURE. The rect was read before the page had finished settling and the
        // click landed on whatever had moved into that spot — two runs reported zero slots and looked
        // exactly like the icons having failed.
        b.scrollIntoView({ block: "center" });
        const r = b.getBoundingClientRect();
        return { ok: true, label: b.getAttribute("aria-label"), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`,
    returnByValue: true,
});
console.log("bag tab:", JSON.stringify(found.result.value));
if (found.result.value?.ok) {
    const hit = await send("Runtime.evaluate", { expression: `(() => { const e = document.elementFromPoint(${found.result.value.x}, ${found.result.value.y}); return e ? e.tagName + "." + (e.className || "").toString().slice(0, 50) : "nothing"; })()`, returnByValue: true });
    console.log("what is under that point:", hit.result.value);
}
if (found.result.value?.ok) {
    const { x, y } = found.result.value;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    // ⚠️ LONG ENOUGH FOR THE SPRITES. The first run reported decoded: 0 and photographed empty slots, and
    // the in-page test then proved the file loads fine — these were simply the first requests for those
    // webps through the dev server and had not finished inside 1.8s. A rig that samples too early reports
    // a missing image and a broken one identically.
    await new Promise((r) => setTimeout(r, 4000));
}

const corner = await send("Runtime.evaluate", { expression: `(() => {
    const out = [];
    for (const e of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(e);
        if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.right < window.innerWidth - 140 || r.bottom < window.innerHeight - 220) continue;
        out.push({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 60), z: cs.zIndex, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
    }
    return { lock: document.body.classList.contains("gv-full-lock"), dock: document.querySelectorAll(".gv-dock button").length, inCorner: out.slice(0, 8) };
})()`, returnByValue: true });
console.log("corner:", JSON.stringify(corner.result.value, null, 1));

const am = await send("Runtime.evaluate", { expression: `(() => { /* AREA MEASURE */
    const a = document.querySelector(".gv-area");
    const sh = document.querySelector(".gv-sheet");
    const st = document.querySelector(".gv-strip");
    const r = a?.getBoundingClientRect();
    return { vh: window.innerHeight, area: r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top)] : null,
             areaCss: a ? getComputedStyle(a).height : null,
             sheet: sh ? Math.round(sh.getBoundingClientRect().height) : null,
             strip: st ? Math.round(st.getBoundingClientRect().height) : null };
})()`, returnByValue: true });
console.log("area:", JSON.stringify(am.result.value));

const check = await send("Runtime.evaluate", {
    expression: `(() => {
        const icons = [...document.querySelectorAll(".gv-ico")];
        return {
            slots: document.querySelectorAll(".gv-slot").length,
            icons: icons.length,
            decoded: icons.filter((i) => i.complete && i.naturalWidth > 0).length,
            firstSrc: icons[0]?.getAttribute("src") || null,
            currentSrc: icons[0]?.currentSrc || null,
            natural: icons[0] ? icons[0].naturalWidth + "x" + icons[0].naturalHeight : null,
            box: icons[0] ? JSON.stringify(icons[0].getBoundingClientRect()) : null,
            display: icons[0] ? getComputedStyle(icons[0]).display : null,
        };
    })()`,
    returnByValue: true,
});
console.log("icons:", JSON.stringify(check.result.value));

const probe2 = await send("Runtime.evaluate", { expression: `(async () => {
    const r = await fetch("/images/grove/part-gnawed_root.webp").then((x) => x.status).catch((e) => "ERR " + e.message);
    const load = await new Promise((res) => { const i = new Image(); i.onload = () => res("loaded " + i.naturalWidth); i.onerror = (e) => res("error"); i.src = "/images/grove/part-gnawed_root.webp?probe=1"; setTimeout(() => res("timeout"), 4000); });
    return { fetchStatus: r, imgLoad: load };
})()`, returnByValue: true, awaitPromise: true });
console.log("in-page:", JSON.stringify(probe2.result.value));

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 390, height: 1100, scale: 2 } });
fs.writeFileSync(`${OUT}/grove-bag.png`, Buffer.from(shot.data, "base64"));
console.log(`${OUT}/grove-bag.png`);

sock.close();
chrome.kill();
await sql`DELETE FROM mkt_buyer_session WHERE device_label = 'grove-bag-shot'`;
