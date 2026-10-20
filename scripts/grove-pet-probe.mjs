// ── IS THE PET ACTUALLY FIGHTING, AND FETCHING? ──────────────────────────────────────────────────────────────
// A contact sheet of a 4.5-unit animal at a 390px viewport cannot answer this. "The pet bit for 13" and "the
// pet did nothing and that 13 was the hero's second hit" photograph identically at that size, and the whole
// feature is a set of claims about WHO did what — which body dealt the damage, which body collected the drop,
// whether it only swings when you do. Those are facts about the simulation, so they get read out of the
// simulation.
//
// The lab hands the live world object out as window.__grove (dev route only, nothing drawn). This samples it
// over a few seconds and reports what the pet actually did.
//
//   node scripts/grove-pet-probe.mjs
//   node scripts/grove-pet-probe.mjs fetch
import { spawn } from "node:child_process";

const SCENE = process.argv[2] || "pet";
const url = `http://localhost:3000/marketplace/grove/lab?scene=${SCENE}&zone=1`;
const PORT = 9413;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ⚠️ ITS OWN --user-data-dir. Chrome refuses to open a debugging port on the default profile, which is how
// this class of script fails with a timeout that reads as "the page never loaded". See
// [[driving-a-browser-with-cdp]].
const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${process.env.TEMP}/cdp-petprobe-${PORT}`, "about:blank",
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
// ⚠️ SHORT, AND THAT IS NOT A DETAIL. At 3500ms the fetch scene reported an empty floor and a pet
// standing at heel, which reads as "the pickup never happened" and is in fact "it finished before
// sampling started". The errand is over in about two seconds. See [[harness-must-reproduce-the-bug-first]].
await new Promise((r) => setTimeout(r, Number(process.env.PET_PROBE_WAIT || 900)));

const report = await evaluate(`(async () => {
    for (let i = 0; i < 40 && !window.__grove; i += 1) await new Promise((r) => setTimeout(r, 200));
    const w = window.__grove;
    if (!w) return { error: "window.__grove never appeared — is this the dev lab route?" };
    const out = {
        samples: [], bites: 0, biteDamage: [], crits: 0, pounces: 0,
        flankedFar: 0, flankedNear: 0, engagedFrames: 0, frames: 0,
        fetches: 0, fetchCommitted: 0, petCollected: 0, heroCollected: 0,
        clawOnFrames: 0, clawFrames: 0, swipeOnFrames: 0,
        petArt: null, heroArt: null, numbers: { pet: 0, hit: 0, crit: 0, loot: 0 },
    };
    out.petArt = document.querySelector(".gv-pet img")?.getAttribute("src") || null;
    out.heroArt = document.querySelector(".gv-hero img")?.getAttribute("src") || null;
    out.petImgDecoded = (() => { const i = document.querySelector(".gv-pet img"); return i ? i.naturalWidth > 0 : null; })();
    out.clawPresent = Boolean(document.querySelector(".gv-pet .gv-claw"));
    out.clawLines = document.querySelectorAll(".gv-pet .gv-claw i").length;

    out.dropsAtStart = w.drops.length;
    let lastFoeHp = null;
    let lastPetAt = null;
    let lastDrops = w.drops.length;
    let lastClaims = w.drops.map((d) => d.to || null);
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
        await new Promise((r) => requestAnimationFrame(r));
        out.frames += 1;
        const tgt = w.petFoe;
        if (w.petEngagedUntil > (w.sceneNow ? w.sceneNow() : performance.now())) out.engagedFrames += 1;
        // A pounce STARTED: petAt moved.
        if (w.petAt != null && w.petAt !== lastPetAt) { out.pounces += 1; lastPetAt = w.petAt; }
        // A bite LANDED: the target lost health while no hero strike was resolving.
        if (tgt && lastFoeHp != null && tgt.hp < lastFoeHp) {
            // Attribution comes off the rendered number, which is the thing the player actually reads.
        }
        if (tgt) lastFoeHp = tgt.hp;
        // Which side of the target the pet stands on, relative to the hero.
        if (tgt && w.petEngagedUntil > performance.now()) {
            const heroSide = Math.sign(w.hero.x - tgt.x) || 1;
            const petSide = Math.sign(w.pet.x - tgt.x) || 1;
            if (petSide !== heroSide) out.flankedFar += 1; else out.flankedNear += 1;
        }
        if (w.petFetch) out.fetchCommitted += 1;
        // ⚠️ THE CLAW IS ON FOR 85ms OF EVERY 370, so a sheet sampled every 45ms can miss it entirely
        // and a still certainly will. Counted per frame instead: it must be ON sometimes and OFF most of
        // the time, and a mark that is always on is a mark that has stopped meaning anything.
        {
            const c = document.querySelector(".gv-pet .gv-claw");
            if (c) { if (getComputedStyle(c).opacity !== "0") out.clawOnFrames += 1; out.clawFrames += 1; }
            const sw = document.querySelector(".gv-hero .gv-swipe");
            if (sw && getComputedStyle(sw).opacity !== "0") out.swipeOnFrames += 1;
        }
        const drawnToPet = w.drops.filter((d) => d.to === "pet").length;
        if (drawnToPet) out.fetches = Math.max(out.fetches, drawnToPet);
        // ⚠️ WHO COLLECTED IT, READ BEFORE IT VANISHES. A drop is spliced out of w.drops the frame it
        // is eaten, so asking afterwards is asking an object that is gone. Each frame records the claim
        // (d.to) of everything still on the floor; when the count drops, the claims that disappeared are
        // the ones that were collected.
        const claims = w.drops.map((d) => d.to || null);
        if (w.drops.length < lastDrops) {
            for (const c of lastClaims) {
                if (!claims.includes(c) || claims.filter((x) => x === c).length < lastClaims.filter((x) => x === c).length) {
                    if (c === "pet") out.petCollected += 1; else if (c === "hero") out.heroCollected += 1;
                    break;
                }
            }
        }
        lastClaims = claims;
        lastDrops = w.drops.length;
    }
    // Every number that was rendered over the run, by class. This is the attribution that matters: a green
    // .is-pet number is the pet's bite and nothing else creates one.
    out.numbers.pet = document.querySelectorAll(".gv-num.is-pet").length;
    out.numbers.hit = document.querySelectorAll(".gv-num.is-hit").length;
    out.numbers.crit = document.querySelectorAll(".gv-num.is-crit").length;
    out.numbers.loot = document.querySelectorAll(".gv-num.is-loot").length;
    out.livePetNumbers = [...document.querySelectorAll(".gv-num.is-pet")].slice(0, 8).map((n) => ({
        text: n.textContent, color: getComputedStyle(n).color, fontSize: getComputedStyle(n).fontSize,
    }));
    out.liveHitNumbers = [...document.querySelectorAll(".gv-num.is-hit")].slice(0, 4).map((n) => ({
        text: n.textContent, color: getComputedStyle(n).color, fontSize: getComputedStyle(n).fontSize,
    }));
    // Every number on screen, with its class — the only way to settle "what is that green 231".
    out.allNumbers = [...document.querySelectorAll(".gv-num")].map((n) => n.className + " = " + n.textContent);
    out.dropsLeft = w.drops.length;
    out.petPos = { x: Math.round(w.pet.x), y: Math.round(w.pet.y) };
    out.heroPos = { x: Math.round(w.hero.x), y: Math.round(w.hero.y) };
    out.foePos = w.petFoe ? { x: Math.round(w.petFoe.x), hp: Math.round(w.petFoe.hp), max: w.petFoe.maxHp } : null;
    return out;
})()`);

console.log(`\nscene=${SCENE}\n`);
console.log(JSON.stringify(report, null, 2));

sock.close();
chrome.kill();
