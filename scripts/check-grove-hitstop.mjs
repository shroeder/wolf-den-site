// ── CAN HIT-STOP HOLD THE WORLD STILL? ───────────────────────────────────────────────────────────────────────
// Luke, 2026-11-08: "Still lots of lag. Is there intentional hit lag building up?"
//
// It was. `clock.stop` was a Math.max, so every corpse pushed the freeze another HITSTOP_MS.kill into the
// future from its own `now`. Kill anything more often than every 130ms and the freeze never lifts: dt stays
// multiplied by HITSTOP_SCALE and the whole simulation runs at 6% speed for ever. The frame rate is fine —
// time has stopped. And it self-sustains, because the swing cooldown is real milliseconds and the player goes
// on swinging inside the freeze.
//
// ⚠️ THIS IS THE GATE THAT WOULD HAVE CAUGHT IT, AND IT MEASURES THE ONE THING THAT MATTERS: what fraction of
// real time the simulation is allowed to spend frozen. A screenshot cannot see this. A physics harness cannot
// see it either — the existing one steps with dt = 1, which is exactly how the negative-dt bug survived too
// (see the long note in makeClock.dt).
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-grove-hitstop.mjs
import { makeClock, HITSTOP_MS, HITSTOP_SCALE } from "../src/lib/marketplace/grove-juice.js";

const EMBLEM_STOP_MS = 190;   // mirrored from GroveScene; see the note there
const QUAFF_STOP_MS = 110;

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

/**
 * Run `frames` at 60fps, calling `onFrame(clock, now)` each one, and report how much REAL time the
 * simulation spent frozen.
 */
function run(frames, onFrame) {
    const clock = makeClock();
    let now = 0;
    let last = 0;
    let stoppedMs = 0;
    let simFrames = 0;
    for (let f = 0; f < frames; f += 1) {
        now += 16.67;
        if (clock.stopped(now)) stoppedMs += 16.67;
        simFrames += clock.dt(now, last);
        last = now;
        onFrame(clock, now, f);
    }
    return { stoppedMs, realMs: frames * 16.67, simFrames,
        frozen: stoppedMs / (frames * 16.67) };
}

console.log("\nTHE DOCUMENTED CASES STILL WORK — STRENGTH DECIDES, WHICH IS WHAT THEY ASKED FOR");
// "a kill outranks a hit"
{
    const c = makeClock();
    c.stop(0, HITSTOP_MS.kill);
    c.stop(10, HITSTOP_MS.hit);
    ok("a hit during a kill-stop does not shorten it", c.stopUntil === HITSTOP_MS.kill,
        `stopUntil ${c.stopUntil}`);
}
// "the heal has to outrank the hit ... so the two compose"
{
    const c = makeClock();
    c.stop(0, HITSTOP_MS.hurt);
    c.stop(5, QUAFF_STOP_MS);
    ok("a quaff takes over the hurt that triggered it", c.stopUntil === 5 + QUAFF_STOP_MS,
        `stopUntil ${c.stopUntil}`);
}
// the rarest moment in the feature must still get its full beat
{
    const c = makeClock();
    c.stop(0, HITSTOP_MS.kill);
    c.stop(20, EMBLEM_STOP_MS);
    ok("an emblem takes over a kill-stop", c.stopUntil === 20 + EMBLEM_STOP_MS, `stopUntil ${c.stopUntil}`);
}
// and a later, separate kill is its own beat
{
    const c = makeClock();
    c.stop(0, HITSTOP_MS.kill);
    c.stop(500, HITSTOP_MS.kill);
    ok("a kill after the freeze lapsed arms again", c.stopUntil === 500 + HITSTOP_MS.kill,
        `stopUntil ${c.stopUntil}`);
}

console.log("\nA SCREEN-WIDE ONE-SHOT CANNOT HOLD THE WORLD STILL");
// Luke's actual case: he one-shots, so every blow is a hit AND a kill, across the whole screen. Twenty
// corpses resolving over the first few frames, then the next swing, for three seconds.
const screenWipe = run(180, (clock, now, f) => {
    // a swing lands every ~400ms, and each one kills a screenful that resolves over four frames
    const inWipe = (f % 24) < 4;
    if (inWipe) {
        for (let body = 0; body < 5; body += 1) {
            clock.stop(now, HITSTOP_MS.hit);
            clock.stop(now, HITSTOP_MS.kill);
        }
    }
});
console.log(`       3s of screen-wide one-shotting: frozen ${(100 * screenWipe.frozen).toFixed(1)}% of real time`);
console.log(`       the simulation advanced ${screenWipe.simFrames.toFixed(0)} frames out of ${180} real ones`);
// ⚠️ THE NUMBER THAT MATTERS. Before the fix this was effectively 100% frozen and ~11 simulated frames out
// of 180 — a world moving at a sixteenth speed, which is what "lots of lag" was.
ok("the world is frozen for less than half of real time", screenWipe.frozen < 0.5,
    `${(100 * screenWipe.frozen).toFixed(1)}%`);
ok("the simulation keeps most of its frames", screenWipe.simFrames > 180 * 0.5,
    `${screenWipe.simFrames.toFixed(0)} of 180`);

console.log("\nEVEN KILLING EVERY SINGLE FRAME CANNOT DEADLOCK IT");
// The pathological case: something dies on literally every frame. This is what the old Math.max could not
// survive — each kill pushed the freeze 130ms past a `now` that was itself inside the freeze.
const everyFrame = run(180, (clock, now) => { clock.stop(now, HITSTOP_MS.kill); });
console.log(`       frozen ${(100 * everyFrame.frozen).toFixed(1)}% of real time,`
    + ` ${everyFrame.simFrames.toFixed(0)} sim frames of 180`);
ok("a kill every frame still leaves the world running", everyFrame.frozen < 0.6,
    `${(100 * everyFrame.frozen).toFixed(1)}% frozen — this is the deadlock`);

console.log("\nAND AN ESCALATING CHAIN IS BOUNDED");
// hit -> crit -> kill -> emblem, each taking over the last. The one case that CAN chain by design.
{
    const c = makeClock();
    c.stop(0, HITSTOP_MS.hit);
    c.stop(10, HITSTOP_MS.crit);
    c.stop(20, HITSTOP_MS.kill);
    c.stop(30, EMBLEM_STOP_MS);
    ok(`a full escalation ends inside 400ms (${c.stopUntil.toFixed(0)}ms)`, c.stopUntil < 400,
        `${c.stopUntil}`);
}

console.log(`\n       HITSTOP_SCALE is ${HITSTOP_SCALE} — while stopped the sim runs at`
    + ` ${(100 * HITSTOP_SCALE).toFixed(0)}% speed, which is why holding the freeze reads as lag`);

console.log(fails ? `\ncheck:grove-hitstop — ${fails} FAILED\n`
    : "\nOK — a beat punctuates, a stream of them cannot stop time, and every documented outranking still holds.\n");
process.exit(fails ? 1 : 0);
