// ── IS THE WAY ON ACTUALLY SHUT UNTIL THE BOSS IS DEAD? ──────────────────────────────────────────────────
// The zone used to open on its kill count, so the boss standing at the far wall was scenery you could walk
// straight past — littlewolf reached zone ten having killed none of them. The gate now hangs on the boss.
//
// That is a three-state claim and a green unit check proves none of it, so this drives the real scene on the
// bench and READS THE DOOR at each state:
//
//   1. cleared, boss alive   → locked, no kill toll, and the label names the boss
//   2. the boss dies         → openedAt lands, the burst fires, the door flips to open
//   3. already open          → stays open (the travel fixture, so a repeat visit is not a regression)
//
// ⚠️ TAPPED WITH Input.dispatchMouseEvent, NOT element.click(). React ignores untrusted events, so a
// synthetic click lands on nothing and photographs as "the boss will not die". See
// [[driving-a-browser-with-cdp]].
//
//   node scripts/grove-boss-gate-probe.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const PORT = 9419;
const ZONE = 2;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--no-first-run",
    `--user-data-dir=${process.env.TEMP}/cdp-bossgate-${PORT}`, "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
    } catch { /* not up yet */ }
}
if (!wsUrl) { console.error("no chrome"); chrome.kill(); process.exit(1); }

const sock = new WebSocket(wsUrl);
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
const evalIn = async (expr) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 760, deviceScaleFactor: 2, mobile: true });

// The door, as the player sees it, plus the live world behind it.
const PROBE = `(() => {
    const w = window.__grove;
    const on = [...document.querySelectorAll(".gv-door")].find((d) => /way on|next zone/i.test(d.getAttribute("aria-label") || ""));
    const need = on?.querySelector(".gv-door-need b");
    return {
        door: on ? {
            locked: on.className.includes("is-locked"),
            opening: on.className.includes("is-opening"),
            art: (on.querySelector("img")?.getAttribute("src") || "").split("/").pop(),
            toll: need ? need.textContent : null,
            aria: on.getAttribute("aria-label"),
        } : null,
        world: w ? {
            bossClaimed: Boolean(w.bossClaimed),
            bossAlive: Boolean(w.boss && w.boss.hp > 0),
            bossHp: w.boss ? Math.round(w.boss.hp) : null,
            openedAt: w.doors.map((d) => (d.openedAt ? "set" : null)),
            clearFlushed: Boolean(w.clearFlushed),
        } : null,
    };
})()`;

const open = async (qs) => {
    await send("Page.navigate", { url: `http://localhost:3000/marketplace/grove/lab?${qs}` });
    await wait(3500);
};

let fails = 0;
const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) fails += 1;
    console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}: ${JSON.stringify(got)}${ok ? "" : `  (wanted ${JSON.stringify(want)})`}`);
};

// ── 1. CLEARED, BOSS ALIVE ──────────────────────────────────────────────────────────────────────────────
console.log(`\n1. zone ${ZONE} cleared, boss standing — the way on must be SHUT`);
await open(`scene=gate&zone=${ZONE}`);
let v = await evalIn(PROBE);
if (!v?.door) { console.log("  FAIL  no way-on door in the DOM"); fails += 1; }
else {
    check("door locked", v.door.locked, true);
    check("art", v.door.art, "portal-locked.webp");
    check("kill toll hidden (the gate is the boss now)", v.door.toll, null);
    check("label names the boss", /defeat/i.test(v.door.aria), true);
    console.log(`        label: "${v.door.aria}"`);
    check("boss is standing", v.world?.bossAlive, true);
    // ⚠️ NOT ASSERTED HERE, AND THAT IS THE FIXTURE, NOT THE CODE. The flush fires from the kill handler
    // on the kill that crosses toUnlock; this scene starts with the toll already banked, so no kill
    // happens and the one-shot never arms. Asserting it here would be asserting a thing this fixture
    // cannot produce. The flush is what lets the server accept the boss at all, and the state it
    // guards is proved by step 2 landing a kill the server would have refused.
    console.log(`        (clearFlushed=${v.world?.clearFlushed} — pre-banked fixture, no crossing kill)`);
}
let shot = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/boss-gate-1-shut.png", Buffer.from(shot.data, "base64"));

// ── 2. KILL IT ──────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n2. kill the boss — the way must OPEN on that kill`);
// ⚠️ scene=boss, NOT scene=gate. The gate fixture stands the boss at the FAR WALL beside the door, which
// is the right shot for step 1 and unreachable for this one — the hero would have to walk the zone. The boss
// scene puts the body at his elbow, which is the only difference that matters here; the door state is
// identical (both bank the toll, both leave unlockedN at the current zone).
await open(`scene=boss&zone=${ZONE}`);
let pre = await evalIn(PROBE);
check("still shut before the kill", pre?.door?.locked, true);

// ⚠️ AND THE HP IS KNOCKED DOWN RATHER THAN FOUGHT. Zone two's boss carries 67,700hp against the bench's 34
// damage — the real fight is the better part of an hour (littlewolf met a FORTY-THREE MINUTE boss at zone
// 12, which is what the whole catalogue note is about). The thing under test is what the DEATH does, so the
// kill still runs the real path: the loop sees hp <= 0, takes the isBoss branch, and that branch is the code
// this probe exists to check. Only the length of the fight is faked.
await evalIn(`(() => { const w = window.__grove; if (w?.boss) { w.boss.hp = 1; return w.boss.hp; } return null; })()`);

const tapBoss = async () => {
    const at = await evalIn(`(() => {
        const b = [...document.querySelectorAll(".gv-foe.is-boss")][0];
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!at) return false;
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1, buttons: 1 });
    }
    return true;
};
const tapped = await tapBoss();
if (!tapped) { console.log("  FAIL  no boss body on screen to tap"); fails += 1; }

// The hero auto-attacks once targeted; re-tap periodically in case he steps off it.
let dead = false;
for (let i = 0; i < 25 && !dead; i += 1) {
    await wait(500);
    v = await evalIn(PROBE);
    dead = Boolean(v?.world?.bossClaimed);
    // Re-tap and re-knock: the hero steps to whatever is next to him, and a respawn pass can stand a
    // fresh body up with full health before the swing that was meant for the last one lands.
    if (!dead && i % 4 === 3) {
        await evalIn(`(() => { const w = window.__grove; if (w?.boss && w.boss.hp > 1) w.boss.hp = 1; })()`);
        await tapBoss();
    }
}
check("boss died", dead, true);
if (dead) {
    check("the door recorded the moment (openedAt)", v.world.openedAt.includes("set"), true);
    check("door now open", v.door?.locked, false);
    check("art", v.door?.art, "portal-open.webp");
}
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("out/boss-gate-2-open.png", Buffer.from(shot.data, "base64"));

// ── 3. AN ALREADY-OPEN WAY STAYS OPEN ───────────────────────────────────────────────────────────────────
console.log(`\n3. a zone whose boss is already down — the way must stay OPEN`);
await open(`scene=travel&zone=${ZONE}`);
v = await evalIn(PROBE);
check("door open", v?.door?.locked, false);
check("art", v?.door?.art, "portal-open.webp");
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("out/boss-gate-3-stays.png", Buffer.from(shot.data, "base64"));

console.log(fails ? `\n${fails} FAILED — the gate is not behaving.` : "\nOK — the way on is shut while the boss lives, and opens on its death.");
console.log("shots: out/boss-gate-1-shut.png, out/boss-gate-2-open.png, out/boss-gate-3-stays.png");
sock.close();
chrome.kill();
process.exit(fails ? 1 : 0);
