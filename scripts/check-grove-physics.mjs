// ── THE GROVE'S PHYSICS, ASSERTED IN BARE NODE ────────────────────────────────────────────────────────────────
// grove-physics.js is import-free on purpose so this can exist: a solver whose failures are "a creature stands
// slightly wrong" or "one body in six hundred leaves the world" cannot be reviewed by looking at a screenshot,
// and by the time it photographs as anything it photographs as something else entirely — an empty forest, a
// pet that never comes back. Same reason check-grove.mjs exists for the geometry.
//
//   node scripts/check-grove-physics.mjs
import {
    makeBody, integrate, drive, hop, impulse, spawnOnPlatform, surfaceUnder, edgeAhead, MAX_FALL,
    navigate, wanderIntent, HOP, HOP_RISE,
} from "../src/lib/marketplace/grove-physics.js";
import { platformsFor, TIER_RISE } from "../src/lib/marketplace/grove-world.js";
import { makeClock } from "../src/lib/marketplace/grove-juice.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Zone 11 — three tiers of ledges, so the one-way and edge cases have something to happen on.
const plats = platformsFor(11, mulberry(7));
// ⚠️ THE ZONE'S REAL WIDTH, NOT A NUMBER TYPED IN ONCE. A hardcoded clampX of [1, 299] against a zone that
// is actually 600 units wide dragged every body to x=299 the instant it was stepped — so the wander check
// reported 28 of 40 creatures falling off a ledge they had been teleported off before they ever moved, and
// it looked exactly like the bug it was written to catch. See harness-must-reproduce-the-bug.
const BOUNDS = [1, plats[0].w - 1];
console.log(`platforms: ${plats.length}, tiers at y = ${[...new Set(plats.map((p) => p.y))].join(", ")}, zone ${plats[0].w} wide`);

// 1. A body spawned on a platform is resting on it and stays there.
{
    const rand = mulberry(3);
    let worst = 0;
    for (let i = 0; i < 400; i += 1) {
        const spot = spawnOnPlatform(plats, rand);
        const b = makeBody({ x: spot.x, y: spot.y, h: 6 });
        for (let f = 0; f < 120; f += 1) integrate(b, plats, 1);
        worst = Math.max(worst, Math.abs(b.y - spot.y));
    }
    ok("a body spawned on a platform stays on it", worst < 0.001, `drifted ${worst.toFixed(4)}`);
}

// 2. ⚠️ NOTHING TUNNELS, even at the biggest step the scene will ever hand over, and even thrown hard. A
//    resumed background tab is the real case: the scene clamps dt to 34ms, which is 2.04 frames.
{
    const rand = mulberry(11);
    let through = 0;
    for (let i = 0; i < 600; i += 1) {
        const b = makeBody({ x: 20 + rand() * 1000, y: 80, h: 6 });
        b.vy = -(2 + rand() * 20);           // far past terminal velocity, as a knockback could be
        b.vx = (rand() - 0.5) * 4;
        for (let f = 0; f < 200; f += 1) integrate(b, plats, 2.04);
        if (b.y < -0.001) through += 1;
    }
    ok("nothing falls through the world at max dt", through === 0, `${through} escaped`);
}

// 3. Walking off a ledge falls to the ground rather than hovering at ledge height. This is the one the old
//    floorUnder could not do: it kept the body's height until its x left the span, then teleported it down.
{
    const ledge = plats.filter((p) => p.y > 0).sort((a, b) => a.x - b.x)[0];
    const b = makeBody({ x: ledge.x + ledge.w - 1, y: ledge.y, h: 6 });
    for (let f = 0; f < 400; f += 1) { drive(b, 1, { accel: 0.09, max: 0.26 }); integrate(b, plats, 1); }
    ok("walking off a ledge lands on the ground", b.y === 0 && b.grounded, `y=${b.y.toFixed(2)} grounded=${b.grounded}`);
}

// 4. A hop from the ground clears the first tier, and does not double-jump.
{
    const b = makeBody({ x: plats[1].x + 10, y: 0, h: 6 });
    ok("a hop is allowed from the floor", hop(b, HOP) === true);
    ok("a second hop mid-air is refused", hop(b, HOP) === false);
    let peak = 0;
    for (let f = 0; f < 200; f += 1) { integrate(b, plats, 1); peak = Math.max(peak, b.y); }
    ok(`a hop reaches the first ledge tier (${TIER_RISE})`, peak >= TIER_RISE, `peak ${peak.toFixed(1)}`);
}

// 5. Friction brings a shoved body to rest, and it does not slide for ever. Without this a knockback would
//    push a creature out of the zone one hit at a time.
{
    const b = makeBody({ x: 200, y: 0, h: 6 });
    impulse(b, 1.4, 0);
    const x0 = b.x;
    for (let f = 0; f < 200; f += 1) integrate(b, plats, 1);
    ok("friction stops a shoved body", b.vx === 0 && b.x > x0, `vx=${b.vx} moved ${(b.x - x0).toFixed(2)}`);
}

// 6. A one-way platform: rising through it does not snag, and it catches you coming down.
{
    const ledge = plats.filter((p) => p.y > 0)[0];
    const b = makeBody({ x: ledge.x + ledge.w / 2, y: 0, h: 6 });
    // ⚠️ HOP, not an arbitrary big number. At vy=4.2 the apex is 160 units up and a 60-frame test never gets
    // back down — which is a broken TEST, not broken physics, and is exactly how a harness lies to you. It
    // failed that way once already; the number is the hop the game actually uses.
    b.vy = HOP;
    let snagged = false;
    for (let f = 0; f < 140; f += 1) { integrate(b, plats, 1); if (b.grounded && b.y === ledge.y && f < 6) snagged = true; }
    ok("you pass up through a ledge instead of snagging on it", !snagged);
    ok("and you land on it coming down", b.y === ledge.y, `y=${b.y}`);
}

// 7. surfaceUnder answers from WHERE YOU FELL FROM, which is the whole difference from the old floorUnder.
{
    const ledge = plats.filter((p) => p.y > 0)[0];
    const below = surfaceUnder(plats, ledge.x + 2, 1);
    const above = surfaceUnder(plats, ledge.x + 2, ledge.y + 5);
    ok("standing under a ledge, the floor is the ground", below.y === 0, `got ${below.y}`);
    ok("falling from above it, the floor is the ledge", above.y === ledge.y, `got ${above.y}`);
}

// 8. Terminal velocity binds — it is the anti-tunnelling floor, not a feel knob.
{
    const b = makeBody({ x: 50, y: 400, h: 6 });
    for (let f = 0; f < 300; f += 1) integrate(b, [{ x: -1e6, w: 2e6, y: -1e6 }], 1);
    ok("terminal velocity binds", Math.abs(b.vy) <= MAX_FALL + 1e-9, `vy=${b.vy.toFixed(3)}`);
}

// 9. Edge awareness sees the lip, so a wanderer can turn round instead of walking off every ledge it meets.
{
    const ledge = plats.filter((p) => p.y > 0)[0];
    const b = makeBody({ x: ledge.x + ledge.w - 3, y: ledge.y, h: 6 });
    ok("a wanderer can see the edge coming", edgeAhead(plats, b, 1) <= 6, `${edgeAhead(plats, b, 1)}`);
    const mid = makeBody({ x: ledge.x + ledge.w / 2, y: ledge.y, h: 6 });
    ok("and sees open floor as open", edgeAhead(plats, mid, 1, 3) === Infinity);
}

// ── 10. CLIMBING, WHICH IS THE WHOLE REASON THE LEDGES EXIST ───────────────────────────────────────────────
// ⚠️ THE ASSERTION THAT HAD TO BE WRITTEN FIRST, because the bug it covers is not visible in a screenshot or
// in a diff: a hero who cannot reach a ledge looks exactly like a hero who does not want to, and the Grove
// shipped with ledges drawn, enemies spawned on them, and no mover in the scene that could ever jump.
//
// So: stand a body on the ground under a real zone's real ledge, run the solver with nothing but navigate()
// driving it, and require that it ARRIVES. Not that it hops — that it ends up standing on the thing.
{
    const ledge = plats.filter((p) => p.y > 0).sort((a, b2) => a.x - b2.x)[0];
    const goal = { x: ledge.x + ledge.w / 2, y: ledge.y };
    const b = makeBody({ x: Math.max(2, ledge.x - 30), y: 0, h: 7, speed: 1 });
    let hops = 0;
    for (let f = 0; f < 600; f += 1) {
        const nav = navigate(plats, b, goal.x, goal.y);
        drive(b, nav.dir);
        if (nav.hop && hop(b, HOP)) hops += 1;
        integrate(b, plats, 1, { clampX: BOUNDS });
        if (b.grounded && Math.abs(b.y - ledge.y) < 0.01) break;
    }
    ok("a body walks up onto a ledge it started under", b.grounded && Math.abs(b.y - ledge.y) < 0.01,
        `ended at y=${b.y.toFixed(1)} (ledge ${ledge.y}) after ${hops} hops`);
    ok("and it did not need an absurd number of hops to get there", hops > 0 && hops < 14, `${hops} hops`);
}

// The same climb, every ledge in every zone, because one lucky ledge proves nothing. ⚠️ A ZONE WHOSE
// SECOND TIER IS UNREACHABLE IS A ZONE WITH AN UNREACHABLE CREATURE ON IT, and that is a tappable thing the
// player cannot get to — worse than nothing being there.
{
    let tried = 0;
    const stranded = [];
    for (const zn of [1, 3, 5, 8, 12]) {
        const zp = platformsFor(zn, mulberry(99 + zn));
        for (const p of zp.filter((q) => q.y > 0)) {
            tried += 1;
            const goal = { x: p.x + p.w / 2, y: p.y };
            const b = makeBody({ x: Math.max(2, p.x + p.w / 2), y: 0, h: 7, speed: 1 });
            let f = 0;
            for (; f < 900; f += 1) {
                const nav = navigate(zp, b, goal.x, goal.y);
                drive(b, nav.dir);
                if (nav.hop) hop(b, HOP);
                integrate(b, zp, 1, { clampX: [1, zp[0].w - 1] });
                if (b.grounded && b.y >= p.y - 0.01) break;
            }
            if (!(b.grounded && b.y >= p.y - 0.01)) stranded.push(`z${zn} ledge at x=${p.x.toFixed(0)} y=${p.y}`);
        }
    }
    ok(`every ledge in five zones is reachable from the floor (${tried} tried)`, stranded.length === 0,
        stranded.slice(0, 4).join("; "));
}

// 11. One standing hop must clear a tier, or nothing above the ground floor is a place — and it must not
// clear it by so much that the hero sails two tiers up every time he jumps.
ok(`one hop clears a ${TIER_RISE}-unit tier`, HOP_RISE > TIER_RISE * 1.25, `rise=${HOP_RISE.toFixed(1)}`);
ok("and does not overshoot the tier above it", HOP_RISE < TIER_RISE * 2, `rise=${HOP_RISE.toFixed(1)}`);

// ── 12. A WANDERER STAYS ON ITS LEDGE ──────────────────────────────────────────────────────────────────────
// ⚠️ THE OTHER HALF OF THE SAME BUG. The old wanderer authored a target x with no idea where the floor
// ended, so a zone's whole population drained off its ledges within about twenty seconds and every ledge was
// permanently empty — a feature that deleted itself while looking like it had never been built.
{
    const ledge = plats.filter((p) => p.y > 0).sort((a, b2) => b2.w - a.w)[0];
    const rand = mulberry(7);
    let fell = 0;
    for (let i = 0; i < 40; i += 1) {
        const b = makeBody({ x: ledge.x + 4 + rand() * (ledge.w - 8), y: ledge.y, h: 5, speed: 0.6 });
        for (let f = 0; f < 900; f += 1) {
            const w = wanderIntent(b, plats, rand, 1);
            drive(b, w.dir);
            if (w.hop) hop(b, HOP);
            integrate(b, plats, 1, { clampX: BOUNDS });
        }
        if (b.y < ledge.y - 0.5) fell += 1;
    }
    // Not zero: a wanderer that hops near a lip can legitimately come down off it, and a creature that
    // NEVER leaves its ledge reads as being on rails. Most of them should still be up there after 15s.
    ok("most wanderers are still on their ledge after fifteen seconds", fell <= 12, `${fell}/40 came down`);
}

// ── 13. ⚠️ THE NEGATIVE FRAME, WHICH EMPTIED THE WHOLE ZONE ────────────────────────────────────────────────
// requestAnimationFrame hands a callback the timestamp of the START of the frame, which can predate a
// performance.now() taken inside that same frame — and the loop seeds its clock with performance.now(). So
// the Grove's FIRST frame routinely arrived with dt = -0.66, gravity ran backwards once, and every body in
// the zone ended up a hundredth of a unit below the floor while moving UP. The landing test needs vy <= 0,
// so nothing ever landed again: the entire population fell at terminal velocity for ever and the scene
// photographed as an empty forest with the backdrop scrolling behind nothing. Nothing threw. Every gate
// passed. The harness could not see it because a harness steps with dt = 1.
{
    const clock = makeClock();
    ok("a frame that arrives before its own clock cannot run time backwards", clock.dt(1000, 1011) >= 0,
        `dt=${clock.dt(1000, 1011)}`);
    const b = makeBody({ x: 40, y: 0, h: 7 });
    integrate(b, plats, clock.dt(1000, 1011), { clampX: BOUNDS });
    for (let f = 0; f < 90; f += 1) integrate(b, plats, 1, { clampX: BOUNDS });
    ok("and a body that lives through one still ends up standing on the floor", b.grounded && b.y >= -0.001,
        `y=${b.y.toFixed(3)} vy=${b.vy.toFixed(3)} grounded=${b.grounded}`);
}

// 14. The backstop itself: put a body under the world by hand and it must come back.
{
    const b = makeBody({ x: 40, y: 0, h: 7 });
    b.y = -120; b.vy = -2;
    integrate(b, plats, 1, { clampX: BOUNDS });
    ok("a body found under the world is put back on the floor", b.y === 0 && b.grounded, `y=${b.y}`);
    const n = makeBody({ x: 40, y: 0, h: 7 });
    n.y = NaN; n.vy = NaN;
    integrate(n, plats, 1, { clampX: BOUNDS });
    ok("and so is one whose position has gone to NaN", Number.isFinite(n.y) && n.grounded, `y=${n.y}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall physics checks passed");
process.exit(fails ? 1 : 0);
