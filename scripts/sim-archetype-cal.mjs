// ── WHAT IS AN ARCHETYPE'S POWER ACTUALLY WORTH? ─────────────────────────────────────────────────────────────
// The Road spends one budget through five different weightings, and they are not equally dangerous: measured
// against a real loadout at 800 power, a Wall came in at 71% and a Brute at 46% — twenty-six points apart on
// identical budgets. Rung to rung that reads as the ladder lurching, which is the opposite of a climb.
//
// This binary-searches, per archetype, the power budget that produces a 50% fight. The RATIO of those numbers
// is what each archetype's point of power is worth, and its reciprocal is the correction the ladder needs so
// that a rung's stated power means one thing.
//
// Calibrated against all three CLASSES, not one, and averaged — tuning the whole board against a single
// reaver would just move the bias rather than remove it.
//
// With a member name it calibrates against THAT person's real loadout through kitFor, which is what matters:
// the first pass of these multipliers was solved against synthetic best-in-slot fighters and did not hold, so
// the Road still lurched seventy points between neighbouring rungs when a real reaver walked it.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-archetype-cal.mjs ["Name"]
import { ARCHETYPES, statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { ladderDr } from "../src/lib/marketplace/arena-ladder.js";
import { CLASSES } from "../src/lib/marketplace/arena-classes.js";
import { db } from "../src/lib/db.js";
import { bout, fighter, fullTree, GEAR } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || null;
const RUNS = WHO ? 320 : 260;

function foeAt(power, archKey) {
    const st = statsForPower(power, archKey, null, 50);
    const ring = ringStats({ ...st, dr: ladderDr(50) });
    return {
        classId: null, abilities: npcAbilities(10), ...ring, damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
    };
}

// A real loadout when asked for by name, otherwise the three classes at best-in-slot with full trees.
let HEROES;
if (WHO) {
    const row = await db.queryOne(
        `SELECT id, display_name FROM mkt_buyer WHERE display_name = $1 OR alias = $1 LIMIT 1`, [WHO],
    );
    if (!row) throw new Error(`no member matching "${WHO}"`);
    const { kitFor } = await import("../src/lib/marketplace/arena.js");
    HEROES = [await kitFor(row.id)];
    console.log(`Calibrating against ${row.display_name}'s real loadout.
`);
} else {
    HEROES = CLASSES.map((c) => fighter(c.id, GEAR.bis, fullTree(c.id)));
}
function winAt(power, archKey) {
    const foe = foeAt(power, archKey);
    let wins = 0, n = 0;
    for (const me of HEROES) {
        for (let i = 0; i < RUNS; i += 1) { if (bout(me, foe).won) wins += 1; n += 1; }
    }
    return wins / n;
}

// The power at which this archetype is an even fight.
function evenPower(archKey) {
    let lo = 100, hi = 6000;
    for (let i = 0; i < 11; i += 1) {
        const mid = Math.round((lo + hi) / 2);
        if (winAt(mid, archKey) > 0.5) lo = mid; else hi = mid;
    }
    return Math.round((lo + hi) / 2);
}

console.log(`Archetype calibration — ${RUNS} bouts per class per probe, three classes at best-in-slot.\n`);
const found = ARCHETYPES.map((a) => ({ key: a.key, name: a.name, even: evenPower(a.key) }));
const mean = found.reduce((s, r) => s + r.even, 0) / found.length;

console.table(found.map((r) => ({
    archetype: r.name,
    "even fight at": r.even,
    "vs mean": `${r.even > mean ? "+" : ""}${Math.round(((r.even / mean) - 1) * 100)}%`,
    // ── DIRECTION MATTERS AND I GOT IT BACKWARDS ONCE ────────────────────────────────────────────
    // `even` is the budget this archetype needs to be a FAIR fight. If it needs MORE than the mean, then at
    // any shared rung power it is arriving too WEAK — so it must be handed more, not less. The multiplier is
    // even/mean. The reciprocal (which this printed at first) doubles the error instead of removing it: it
    // took the spread from 26 points to 92 and made a Wall a 98% walkover.
    "suggested mult": (r.even / mean).toFixed(2),
})));
console.log(`\nMean even-fight power: ${Math.round(mean)}`);
console.log("`suggested mult` scales the rung's power for that archetype, so one stated power means one difficulty.");
process.exit(0);
