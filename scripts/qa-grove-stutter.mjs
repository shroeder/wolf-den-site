// ── WHAT ACTUALLY HAPPENS TO THE FRAME RATE WHEN SEVERAL THINGS DIE AT ONCE ────────────────────────────────
// Luke: "when I kill like more than one thing, the game freaking like lags out and freaking like stutters
// big time."
//
// This has been "fixed" once already, by capping the particle pool at SPARK_BUDGET = 150. That cap went in
// BY CONSTRUCTION and was never measured, because the rig that was supposed to measure it reported a peak of
// zero particles — its taps targeted creatures but never killed any, so its frame numbers were about nothing
// at all. A green number from a rig that is not exercising the thing is worse than no number.
//
// So this one measures the only two quantities that matter and refuses to report unless it saw the event:
//
//   · frame intervals, sampled in the page from requestAnimationFrame
//   · how many effect nodes the game creates per frame, which is the suspected cause
//
// and it reports the frames that land in the same window as a BURST of deaths, separately from the rest. A
// p99 over the whole session hides exactly the complaint: everything is fine until three things die together.
//
// ── WHAT THIS RIG HAS ALREADY RULED OUT ─────────────────────────────────────────────────────────────────
// Measured on a PRODUCTION build at 6x CPU throttle, which is roughly Luke's phone against this box. The
// stall is real and reproducible: in zone card 3, 48 of 99 multi-kill frames missed the 33ms budget with a
// p99 of 215ms, against a calm p50 of 7ms. Ordinary play is fine; multi-kills are not.
//
//   · mix-blend-mode on the painted skill effects — NOT the cause. Forcing it off (NO_BLEND=1) leaves the
//     stall unchanged (152.9ms vs 139ms worst). Ruled out by experiment, not by argument.
//   · the number of particle nodes created in one frame — NOT the cause. A per-frame creation budget cut
//     the spike from 180 nodes to ~70 and the frame times did not move, so it was reverted rather than
//     left in: it is a visible reduction in particles during the best moment in the game, bought nothing,
//     and "a cost cut the player can notice is a bug, not a saving".
//   · hit-stop running long — NOT the cause. HITSTOP_MS.kill is 130ms and clock.stop takes the LATER of
//     the two, so a chain of kills could in principle hold the freeze open for its whole length. Measured
//     directly (the hero's transform not changing between frames): 2 frames, ~69ms. It behaves.
//
// What the profiler says is left: GroveScene.useEffect.step itself, at 3913ms of SELF time over a 60s
// fight — nine times the next real entry, and not React, not the GC, not compositing. The cost is inside
// the scene loop and it scales with how many things die at once. That is where to look next.
//
//   SHOT_COOKIE=<token> node scripts/qa-grove-stutter.mjs [zoneCardIndex]
//   PROFILE=1 ...   name the hottest functions      NO_BLEND=1 ...   rule the blend in or out
//   THROTTLE=1 ...  measure this desktop instead    FIGHT_MS=90000   fight for longer
//
// ⚠️ PICK A ZONE THAT STILL HAS CREATURES IN IT. Kills persist, so re-running against the same card
// eventually fights an empty zone and the rig correctly refuses to report. Pass a different index.
import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const COOKIE = process.env.SHOT_COOKIE;
const ZONE_INDEX = Number(process.argv[2] || 1);
const FIGHT_MS = Number(process.env.FIGHT_MS || 45000);
// A frame is "dropped" if it took longer than two 60fps frames. At 33ms the eye reads a hitch.
const BUDGET_MS = 33;

if (!COOKIE) { console.log("no SHOT_COOKIE — mint one with scripts/_mint-shot-session.mjs"); process.exit(1); }
await requireDevServer(PORT);
const chrome = launchChrome(9373, "qa-stutter-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9373));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const waitFor = async (x, n = 240) => { for (let k = 0; k < n; k++) { if (await ev(x)) return true; await sleep(500); } return false; };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 2000, height: 900, deviceScaleFactor: 1, mobile: true });
// ⚠️ THROTTLE THE CPU OR THIS MEASURES THE WRONG MACHINE. Headless Chrome on a desktop runs this scene at
// ~140fps with 7ms frames, which is so much headroom that a real stall on a phone would not show up at all
// -- a clean result there says nothing about the device the complaint came from. 6x is roughly a mid-range
// Android against this box. Pass THROTTLE=1 to measure the desktop instead.
const THROTTLE = Number(process.env.THROTTLE || 6);
await send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
console.log(`CPU throttled ${THROTTLE}x`);
await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: "localhost", path: "/" });
await send("Page.navigate", { url: `http://localhost:${PORT}/marketplace/grove` });
if (!await waitFor(`document.body.classList.contains("gv-full-lock")`, 240)) { console.log("never reached the Grove"); process.exit(1); }
await ev(`(() => {
    const row = document.querySelectorAll(".ga-atlas .ga-row")[0];
    const cards = [...row.querySelectorAll(".ga-card")].filter((c) => !c.classList.contains("ga-town"));
    cards[${ZONE_INDEX}]?.click();
})()`);
if (!await waitFor(`!!document.querySelector(".gv-hero")`, 200)) { console.log("never entered a zone"); process.exit(1); }

// A controlled experiment rather than a hunch. mix-blend-mode makes the compositor read back the backdrop
// for every blended layer, which is one of the few genuinely expensive things a browser can be asked to do
// on a phone — and the painted skill effects turned it on for seven shapes. Running the same fight with the
// blend forced off isolates that one variable: if the stall survives, the blend is not the cause and the
// next guess would have been wrong.
if (process.env.NO_BLEND) {
    await ev(`(() => { const st = document.createElement("style");
        st.textContent = ".gv-sfx, .gv-sfx.has-art { mix-blend-mode: normal !important; }";
        document.head.appendChild(st); return true; })()`);
    console.log("mix-blend-mode FORCED OFF for this run");
}
await sleep(3500);

// ── samplers ────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ SAMPLED IN THE PAGE, NOT OVER CDP. Asking the browser for a number once per round trip measures the
// websocket, not the frame loop; the hitch being chased is a handful of frames long and would vanish.
await ev(`(() => {
    window.__perf = { frames: [], adds: [], deaths: [], sparks: [], freezes: [] };
    let last = performance.now();
    // ⚠️ THE LAYER IS LOOKED UP ONCE. Calling querySelector inside the rAF callback put querySelector into
    // the profile's own top ten — the rig was measuring itself. An instrument that costs what it is trying
    // to measure reports a number about the instrument.
    const fxLayer = document.querySelector(".gv-fx");
    const hero = document.querySelector(".gv-hero");
    let lastTr = null, still = 0;
    const tick = (t) => {
        window.__perf.frames.push([Math.round(t), Math.round((t - last) * 100) / 100]);
        last = t;
        // How many particles are alive right now — the quantity SPARK_BUDGET is supposed to be bounding.
        if (fxLayer) window.__perf.sparks.push([Math.round(t), fxLayer.childElementCount]);
        // ⚠️ IS THE SCENE ACTUALLY MOVING? Frame intervals cannot answer this. Hit-stop deliberately scales
        // dt to near zero on every kill (HITSTOP_MS.kill = 130ms) and the clock takes the LATER of the
        // current freeze and the new one — so one kill freezes for 130ms, but kills landing 50ms apart keep
        // pushing the end forward and the freeze runs for the whole chain. Through all of that rAF keeps
        // firing happily at 7ms, so every frame-time number looks fine while the game is visibly stopped.
        // That is exactly the shape of "it lags out and stutters big time" with nothing in the frame graph.
        if (hero) {
            const tr = hero.style.transform;
            if (tr === lastTr) still += 1;
            else { if (still > 1) window.__perf.freezes.push([Math.round(t), still]); still = 0; lastTr = tr; }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const layer = document.querySelector(".gv-fx");
    if (layer) {
        new MutationObserver((muts) => {
            let n = 0;
            for (const mu of muts) n += mu.addedNodes.length;
            if (n) window.__perf.adds.push([Math.round(performance.now()), n]);
        }).observe(layer, { childList: true });
    }
    // A death is a .gv-foe leaving the world. Counting the bodies each frame is cheaper and more reliable
    // than trying to hook the game's own kill path from outside it.
    const world = document.querySelector(".gv-world") || document;
    let prev = world.querySelectorAll(".gv-foe").length;
    setInterval(() => {
        const now = world.querySelectorAll(".gv-foe").length;
        if (now < prev) window.__perf.deaths.push([Math.round(performance.now()), prev - now]);
        prev = now;
    }, 60);
    return true;
})()`);

// ── fight ───────────────────────────────────────────────────────────────────────────────────────────────
const tapAt = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "touch" });
    }
};
// ⚠️ TARGET THE DENSEST CLUMP, NOT THE NEAREST BODY. The complaint is specifically about several things
// dying together, so a rig that picks off whatever is closest can run for a minute and never once produce
// the event it exists to measure — which is how the last attempt came back with a peak of zero.
const clumpAt = async () => JSON.parse(await ev(`(() => {
    const rs = [...document.querySelectorAll(".gv-foe")].map((e) => e.getBoundingClientRect())
        .filter((r) => r.width && r.left > 40 && r.right < innerWidth - 40 && r.top > 0);
    if (!rs.length) return "null";
    let best = null;
    for (const r of rs) {
        const cx = r.left + r.width / 2;
        const near = rs.filter((o) => Math.abs((o.left + o.width / 2) - cx) < 320).length;
        if (!best || near > best.near) best = { near, x: Math.round(cx), y: Math.round(r.top + r.height / 2) };
    }
    return JSON.stringify(best);
})()`) || "null");

// ⚠️ PROFILE=1 ASKS THE CPU WHAT IS BURNING THE TIME instead of guessing. Three guesses had already been
// made about this stall (particle count, then the per-frame spike, then mix-blend-mode) and only the second
// was even partly right; the blend was ruled out by experiment. A sampling profile names the function.
if (process.env.PROFILE) {
    await send("Profiler.enable");
    await send("Profiler.setSamplingInterval", { interval: 200 });
    await send("Profiler.start");
}

const started = Date.now();
let taps = 0;
while (Date.now() - started < FIGHT_MS) {
    const c = await clumpAt();
    if (c) { await tapAt(c.x, c.y); taps += 1; }
    else {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
        await sleep(750);
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
    }
    await sleep(800);
}

if (process.env.PROFILE) {
    const { profile } = await send("Profiler.stop");
    // Self time per function: how long the CPU spent INSIDE it, not inside things it called. That is the
    // column that points at a culprit; total time just points back up at the frame loop.
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas || [];
    const samples = profile.samples || [];
    for (let i = 0; i < samples.length; i += 1) {
        const n = byId.get(samples[i]);
        if (!n) continue;
        const f = n.callFrame;
        const key = `${f.functionName || "(anonymous)"}  ${String(f.url || "").split("/").pop()}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
    }
    console.log("\n  hottest functions by SELF time (ms over the whole fight):");
    for (const [k, ms] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
        console.log(`    ${String(Math.round(ms)).padStart(6)}ms  ${k}`);
    }
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────
const perf = JSON.parse(await ev(`JSON.stringify(window.__perf)`) || `{"frames":[],"adds":[],"deaths":[],"sparks":[]}`);
const frames = perf.frames || [], deaths = perf.deaths || [], adds = perf.adds || [], sparks = perf.sparks || [];
const totalDeaths = deaths.reduce((a, d) => a + d[1], 0);
const multi = deaths.filter((d) => d[1] > 1);

let fails = 0;
const check = (ok, m) => { console.log(`  ${ok ? "✓" : "✗"} ${m}`); if (!ok) fails += 1; };
const pct = (arr, p) => arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

// Frames inside 500ms AFTER any death burst of 2+, versus everything else.
const inBurst = (t) => multi.some((d) => t >= d[0] - 60 && t <= d[0] + 500);
const burstDt = frames.filter((f) => inBurst(f[0])).map((f) => f[1]);
const calmDt = frames.filter((f) => !inBurst(f[0])).map((f) => f[1]);

console.log(`\n${taps} taps over ${Math.round(FIGHT_MS / 1000)}s · ${frames.length} frames sampled`);
console.log(`${totalDeaths} creatures died, ${multi.length} of those were MULTI-kills (${multi.map((d) => d[1]).join(", ") || "none"})\n`);

// ⚠️ THE RIG MUST PROVE IT SAW THE EVENT BEFORE IT IS ALLOWED TO REPORT ON IT.
if (!multi.length) {
    console.log("  ✗ NO MULTI-KILL HAPPENED. Every frame number below would be about ordinary play, which is");
    console.log("    exactly the mistake the last version of this rig made. Re-run, or raise FIGHT_MS.");
    fails += 1;
}

const line = (name, a) => console.log(`  ${name.padEnd(22)} p50 ${String(pct(a, 0.5)).padStart(6)}ms   p95 ${String(pct(a, 0.95)).padStart(6)}ms`
    + `   p99 ${String(pct(a, 0.99)).padStart(6)}ms   worst ${String(Math.max(0, ...a)).padStart(7)}ms   over ${BUDGET_MS}ms: `
    + `${a.filter((d) => d > BUDGET_MS).length}/${a.length}`);
console.log("  frame intervals:");
line("during multi-kills", burstDt);
line("the rest of the time", calmDt);

// How long the world actually stood still, in frames and in milliseconds, around a multi-kill.
const freezes = perf.freezes || [];
const frameMs = pct(frames.map((f) => f[1]), 0.5) || 16;
const nearMulti = (t) => multi.some((d) => t >= d[0] - 200 && t <= d[0] + 1400);
const burstFreeze = freezes.filter((f) => nearMulti(f[0]));
const worstFreeze = Math.max(0, ...burstFreeze.map((f) => f[1]));
console.log(`
  longest stretch with the scene NOT MOVING:`);
console.log(`    around a multi-kill : ${worstFreeze} frames  (~${Math.round(worstFreeze * frameMs)}ms)`);
const calmFreeze = Math.max(0, ...freezes.filter((f) => !nearMulti(f[0])).map((f) => f[1]));
console.log(`    the rest of the time: ${calmFreeze} frames  (~${Math.round(calmFreeze * frameMs)}ms)`);

const maxSparks = Math.max(0, ...sparks.map((s) => s[1]));
const maxAdd = Math.max(0, ...adds.map((a) => a[1]));
console.log(`\n  most particles alive at once : ${maxSparks}`);
console.log(`  most nodes added in one go   : ${maxAdd}`);

console.log("");
if (multi.length) {
    // The honest comparison: is a multi-kill frame materially worse than a normal one?
    // ⚠️ ABSOLUTE THRESHOLDS, NOT A COMPARISON WITH THE CALM BASELINE. The first version asked only
    // whether a multi-kill frame was worse than an ordinary one, which went GREEN on a run where every
    // frame was bad — the baseline had degraded to meet it. A relative assertion cannot tell "the spike
    // is fixed" from "everything is now equally slow", and the second is not a pass.
    const bp99 = pct(burstDt, 0.99), cp99 = pct(calmDt, 0.99);
    const overBurst = burstDt.filter((d) => d > BUDGET_MS).length;
    check(bp99 <= 60, `multi-kill frames stay under 60ms at p99 (${bp99}ms; calm baseline ${cp99}ms)`);
    check(overBurst / Math.max(1, burstDt.length) < 0.1,
        `fewer than 10% of multi-kill frames miss the ${BUDGET_MS}ms budget (${overBurst}/${burstDt.length})`);
    check(Math.max(0, ...burstDt) < 120, `no single frame stalls visibly during a multi-kill (worst ${Math.max(0, ...burstDt)}ms)`);
    // And the calm baseline has to be honest too, or the two above can be met by a slideshow.
    check(pct(calmDt, 0.5) <= 24, `ordinary play holds a reasonable frame time (p50 ${pct(calmDt, 0.5)}ms)`);
}
if (multi.length) {
    // 130ms of hit-stop is DESIGNED and feels good on a single kill. A third of a second does not.
    check(worstFreeze * frameMs < 320, `the scene is never frozen for long on a multi-kill (~${Math.round(worstFreeze * frameMs)}ms)`);
}
check(maxSparks <= 200, `the particle pool stays bounded (peak ${maxSparks}, SPARK_BUDGET is 150 plus effect nodes)`);
console.log(fails ? `\n${fails} FAILURES` : `\nmulti-kills measured, and they do not blow the frame budget.`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
