// ── THE KILL REQUIREMENT, PRICED IN SWINGS INSTEAD OF KILLS ──────────────────────────────────────────────────
// Luke: "difficulty is not the primary pushback on the player. The primary pushback is the kill count required
// to unlock the next area... by the time you get to map 4 it should be requiring like 5,000 kills... they need
// more damage to get more multi-kill, to get more kills to unlock the next level faster."
//
// That design only works if multi-kill actually fires at the player's own frontier, and today it does not:
// enemy HP compounds at GROVE_SCALE.hpPerZone a zone while the player's damage does not, so you are matched
// forever, every blow is x1, and the door is a stopwatch at GROVE_POP's 40 bodies a minute. 5,000 kills at x1
// is 125 minutes for ONE node.
//
// So this models the thing that actually matters: for a player at a given power, at each depth, what multi-kill
// rung do they land on, and therefore how many SWINGS does the door cost? Kills are the number on the door;
// swings are the time. A curve is only honest if it is read in minutes.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-gate.mjs [--dps 71]
import { GROVE_ZONES, GROVE_ENEMIES, GROVE_POP, killCredit, MULTI_KILL_MAX, spawnGapMs, scaledFoe } from "@/lib/marketplace/grove-catalog.js";
import { zoneUnlock } from "@/lib/marketplace/grove-maps.js";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? Number(process.argv[i + 1]) : d; };

// Real per-swing damage from scripts/grove-power.mjs, 192 members who have actually played.
const BANDS = [
    { name: "p50", swing: () => 15 },
    { name: "p90", swing: () => 276 },
    { name: "p100", swing: () => 7937 },
    // ⚠️ THE ONLY BAND THAT MEANS ANYTHING AT DEPTH. The percentiles above are TODAY'S population, almost
    // none of whom have set foot in the Grove — judging a depth-48 door against a member who never geared
    // past map 1 says nothing about the curve, only about who has played. The difficulty note in
    // grove-catalog fits player power at +2.67% a zone from a newcomer's 1,687 dps, so this is the person
    // the curve is actually a claim about: someone who kept up.
    { name: "on-curve", swing: (d) => (1687 / 2.4) * Math.pow(1.0267, Math.max(0, d - 1)) },
];

// Bodies a zone can physically produce — one spawn per gap, capped by the standing population.
const BODIES_PER_MIN = 60_000 / spawnGapMs();

/** Enemy health at a depth, taken from the catalogue rather than re-derived. */
function hpAt(depth) {
    const z = GROVE_ZONES.find((x) => x.n === depth);
    if (!z) return null;
    const ids = z.enemies || [];
    if (!ids.length) return null;
    // ⚠️ THROUGH scaledFoe, NOT THE RAW CATALOGUE. GROVE_ENEMIES holds BASELINES AT DEPTH 1 and the depth
    // multiplier is applied at spawn — so reading .hp straight off gave 9 at depth 1 and 10 at depth 84, i.e.
    // a game with no difficulty curve at all. That is the measurement saying "your model is wrong", not the
    // game saying "the curve is flat", and the difference is the whole question being asked here.
    // scaledFoe takes the ID, not the creature.
    const hps = ids
        .map((e) => (typeof e === "object" ? e.id : e))
        .map((id) => Number(scaledFoe(id, depth)?.hp))
        .filter((n) => Number.isFinite(n) && n > 0);
    return hps.length ? hps.reduce((a, b) => a + b, 0) / hps.length : null;
}

console.log(`bodies a zone can produce: ${BODIES_PER_MIN.toFixed(0)}/min `
    + `(pop ${GROVE_POP.max}, respawn ${GROVE_POP.respawnMs / 1000}s), multi-kill cap x${MULTI_KILL_MAX}\n`);

console.log("depth  enemy hp   door(kills)   " + BANDS.map((b) => `${b.name}: credit  min`).join("   "));
console.log("─".repeat(108));

for (const depth of [1, 6, 12, 13, 18, 24, 25, 36, 37, 48, 60, 72, 84]) {
    const hp = hpAt(depth);
    const door = zoneUnlock(depth);
    const cells = BANDS.map((b) => {
        if (hp == null) return "   —      —  ";
        const credit = killCredit(b.swing(depth), hp);
        // Bodies needed = kills / credit. Time = bodies / rate. Multi-kill buys TIME, never bodies.
        const bodies = door / credit;
        const mins = bodies / BODIES_PER_MIN;
        return `x${String(credit).padEnd(2)}  ${mins.toFixed(1).padStart(5)}`;
    });
    console.log(
        `${String(depth).padStart(5)}  ${String(hp == null ? "?" : Math.round(hp)).padStart(8)}   `
        + `${String(door).padStart(11)}   ${cells.join("    ")}`,
    );
}

console.log("\n⚠️  Any column stuck at x1 is a player for whom the door is pure wall-clock.");
console.log("    Luke's target: ~10 min a node at map 2, and map 4 asking thousands of kills");
console.log("    WITHOUT asking hours — which only works if credit climbs with depth.");
