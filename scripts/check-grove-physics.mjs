// ── THE GROVE'S PHYSICS, ASSERTED IN BARE NODE ────────────────────────────────────────────────────────────────
// grove-physics.js is import-free on purpose so this can exist: a solver whose failures are "a creature stands
// slightly wrong" or "one body in six hundred leaves the world" cannot be reviewed by looking at a screenshot,
// and by the time it photographs as anything it photographs as something else entirely — an empty forest, a
// pet that never comes back. Same reason check-grove.mjs exists for the geometry.
//
//   node scripts/check-grove-physics.mjs
import {
    makeBody, integrate, drive, hop, impulse, spawnOnPlatform, surfaceUnder, edgeAhead, MAX_FALL,
} from "../src/lib/marketplace/grove-physics.js";
import { platformsFor, HOP } from "../src/lib/marketplace/grove-world.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Zone 11 — three tiers of ledges, so the one-way and edge cases have something to happen on.
const plats = platformsFor(11, mulberry(7));
console.log(`platforms: ${plats.length}, tiers at y = ${[...new Set(plats.map((p) => p.y))].join(", ")}`);

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
    ok("a hop reaches the first ledge tier (26)", peak >= 26, `peak ${peak.toFixed(1)}`);
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

console.log(fails ? `\n${fails} FAILED` : "\nall physics checks passed");
process.exit(fails ? 1 : 0);
