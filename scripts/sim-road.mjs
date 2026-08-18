// ── WHERE DOES THE LONG ROAD BECOME UNWINNABLE? ──────────────────────────────────────────────────────────────
// Walks every rung against a real fighter at each gear tier and reports the win rate, using the SAME engine
// and the SAME bout loop the game and sim-arena.mjs run (scripts/lib/sim-harness.mjs). Nothing here models
// combat; it only builds the two sides and counts.
//
// The question it exists to answer: the Road is 100 rungs, a member's gear budget stops at 644, and the rung
// power curve is an exponential with no ceiling — so at some rung the foe's budget passes anything a person
// can ever field and every rung above it is decoration. This prints that rung.
//
// Usage:  node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/sim-road.mjs [runs] [--all]
//         npm run sim:road
import { ladderFoe, ladderDr } from "../src/lib/marketplace/arena-ladder.js";
import { statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { CLASSES } from "../src/lib/marketplace/arena-classes.js";
import { bout, fighter, fullTree, GEAR } from "./lib/sim-harness.mjs";

const RUNS = Number(process.argv[2]) || 300;
const ALL = process.argv.includes("--all");

// A rung, built the way the game builds it: the ladder's power + archetype through statsForPower, then the
// same ringStats every fighter goes through. `ladderDr` is the Road's own damage reduction, which npcs
// otherwise do not carry — leaving it out would model a fight that does not exist.
function roadFighter(rung) {
    const foe = ladderFoe(rung);
    const st = statsForPower(foe.power, foe.archetype, null, rung);
    const ring = ringStats({ ...st, dr: ladderDr(rung) });
    return {
        classId: null,
        // Mirrors arena.js: a champion is read a tier band up, which is where its edge now lives.
        abilities: npcAbilities(Math.max(1, Math.round(rung * 0.9) + (foe.champion ? 8 : 0)), foe.archetype),
        ...ring,
        damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
    };
}

const pct = (n) => `${(n * 100).toFixed(0)}%`;
const CLASS_ID = CLASSES[0].id;

console.log(`Long Road simulator — ${RUNS} bouts per cell, engine imported (nothing copied).`);
console.log(`Member gear budgets: fresh ${GEAR.fresh}, mid ${GEAR.mid}, best-in-slot ${GEAR.bis}.\n`);

const rungs = ALL
    ? Array.from({ length: 100 }, (_, i) => i + 1)
    : [1, 3, 5, 8, 10, 13, 15, 18, 20, 22, 25, 28, 30, 35, 40, 50, 60, 75, 100];

const rows = [];
const lastWin = { fresh: 0, mid: 0, bis: 0 };
for (const rung of rungs) {
    const foe = roadFighter(rung);
    const row = { rung, foePower: ladderFoe(rung).power, foeHP: Math.round(foe.health), foeDmg: Math.round(foe.damage) };
    for (const [label, gear] of Object.entries(GEAR)) {
        const me = fighter(CLASS_ID, gear, fullTree(CLASS_ID));
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
        const w = wins / RUNS;
        row[label] = pct(w);
        if (w >= 0.5) lastWin[label] = rung;
        if (label === "bis") { row.myHP = Math.round(me.health); row.myDmg = Math.round(me.damage); }
    }
    rows.push(row);
}
console.table(rows);

console.log("\nHighest rung each gear tier still wins at least half the time:");
console.table([{ fresh: lastWin.fresh, mid: lastWin.mid, "best-in-slot": lastWin.bis }]);
console.log(`\nThe Road is ${100} rungs long. Anything above the best-in-slot number is content nobody can reach.`);
