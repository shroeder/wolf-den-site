// ── THE ARENA'S GATE ─────────────────────────────────────────────────────────────────────────────────────────
// `npm run check:arena` has pointed at this filename since the rework and the file did not exist, so the one
// system in the game with a person on the other end of it had no gate at all. (`sim-arena.mjs` is the balance
// harness and is a separate, larger job — it still imports `ringStats` and `throwBlows`, which the rework
// removed, so it does not currently compile either.)
//
// This is deliberately NOT a balance simulator. It asserts the handful of things that must be true of every
// fight no matter how the numbers are tuned — the invariants a member notices the moment one breaks:
//
//   1. A FIGHT ENDS. No pairing, however defensive, can run forever.
//   2. YOU GET A TURN. You may be beaten; you may not be beaten without ever being asked what you do. This is
//      the one that shipped broken: chill re-rolled independently every turn at up to 60% and a stun took one
//      turn per point, with nothing anywhere stopping a run of them. Four members reported it within a day of
//      the rework, all describing it as the fight starting with their health already gone. Against the nasty
//      pairing below it was happening in 78% of bouts.
//   3. NOBODY LOSES TWO TURNS IN A ROW. The rule that fixes (2), asserted directly rather than by proxy.
//
// (A mutual knockout was fixed in the same change but is NOT asserted here — see the note further down.)
//
// It runs the REAL ring — the same openRing/act the request handler calls — because a second implementation
// of a beat is exactly how this codebase got into trouble before. See the header of sim-arena.mjs.
import { act, openRing, ringResult } from "../src/lib/marketplace/arena-ring.js";

const RUNS = Number(process.argv[2] || 4000);

const fighter = (over = {}) => ({
    damage: 120, health: 1400, critChance: 0.15, critMult: 1.8, armour: 0.1, ...over,
});

// The shape members actually hit: a defensive opponent that stacks chill and freezes. If the invariants hold
// here they hold for the ordinary case, which is the whole point of choosing a nasty pairing.
const PAIRINGS = [
    { name: "heavy chill + freeze", me: {}, foe: { chill: 0.55, freeze: 2, damage: 150 } },
    { name: "mutual chill", me: { chill: 0.4 }, foe: { chill: 0.4 } },
    { name: "shield wall", me: {}, foe: { ward: 0.5, wardRefill: 0.06, guardChance: 0.4, damage: 80 } },
    { name: "bleed race", me: { bleedChance: 0.6 }, foe: { bleedChance: 0.6, thorns: 0.2 } },
];

let fail = 0;
for (const pair of PAIRINGS) {
    let neverActed = 0; let neverEnded = 0; let capped = 0; let worstRun = 0;

    for (let i = 0; i < RUNS; i += 1) {
        let ring = openRing(fighter(pair.me), fighter(pair.foe), { foeSkills: {}, foeName: "Gate" });
        let acted = 0;
        for (let guard = 0; guard < 500 && !ring.over; guard += 1) {
            if (ring.awaiting !== "act") break;
            ring = act(ring, {});
            acted += 1;
        }
        const r = ringResult(ring);
        if (!ring.over) neverEnded += 1;
        if (r.unresolved) capped += 1;
        // Beaten without ever being asked. Dying to a wound on your own turn still counts as having had one.
        if (acted === 0 && !r.won) neverActed += 1;

        // Consecutive lost turns FOR ONE SIDE. Counted per side, because the two alternate and a naive
        // counter over the whole transcript is reset by the other fighter's swing — which is how a broken
        // build can read as healthy.
        const run = { me: 0, foe: 0 };
        for (const l of ring.log) {
            const side = l.who === "me" ? "me" : "foe";
            if (l.stunnedSkip || l.chilledSkip) { run[side] += 1; if (run[side] > worstRun) worstRun = run[side]; }
            else if (l.dmg !== undefined || l.cast) run[side] = 0;
        }
    }

    const bad = [];
    if (neverEnded) bad.push(`${neverEnded} never ended`);
    if (neverActed) bad.push(`${neverActed} lost without ever acting`);
    if (worstRun > 1) bad.push(`${worstRun} turns lost in a row`);
    if (bad.length) fail += 1;
    console.log(`  ${pair.name.padEnd(22)} ${bad.length ? `FAIL — ${bad.join(", ")}` : "ok"}`
        + `   (${capped} of ${RUNS} hit the beat cap)`);
}

// NOT COVERED HERE: the mutual knockout. Two fighters emptying both bars on one blow could not be provoked
// reliably through the real path — the bout settles on the killing blow — and a case that cannot fire is a
// check that always reads green, which is worse than no check. The rule lives in settle() in arena-ring.js
// and is reviewed there; if settle ever gets exported for testing, assert it directly.

console.log(fail
    ? `\ncheck:arena — ${fail} invariant(s) broken. A fight must end, and you must get a turn.`
    : `\ncheck:arena — every fight ends, everybody gets a turn, and nobody loses two in a row.`);
process.exit(fail ? 1 : 0);
