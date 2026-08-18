// ── WHAT DOES ONE MORE RUNG COST? ────────────────────────────────────────────────────────────────────────────
// The Road is meant to be a readout of your power: fail a rung, go and improve something, come back a day
// later and get past the fighter that stopped you. That only works if the exchange rate between "stats" and
// "rungs" is a shape a person can feel — a few percent of gear should be worth a rung or two, not a tenth of
// one and not fifteen.
//
// This sweeps a member's REAL loadout by a scalar on their equipped stats, walks the whole Road at each step
// (kitFor + the real engine), and prints where they stall. The output is the exchange rate itself.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-road-progress.mjs "The Wolf Den" [runs]
import { ladderFoe, ladderDr, LADDER_SIZE } from "../src/lib/marketplace/arena-ladder.js";
import { statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { getEquippedStats } from "../src/lib/marketplace/inventory.js";
import { db } from "../src/lib/db.js";
import { bout } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || "The Wolf Den";
const RUNS = Number(process.argv[3]) || 120;

function roadFighter(rung) {
    const foe = ladderFoe(rung);
    const st = statsForPower(foe.power, foe.archetype, null, rung);
    const ring = ringStats({ ...st, dr: ladderDr(rung) });
    return {
        classId: null,
        abilities: npcAbilities(Math.max(1, Math.round(rung * 0.9) + (foe.champion ? 8 : 0)), foe.archetype),
        ...ring, damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
    };
}

// The highest rung this fighter still takes at least half the time.
function wallFor(me) {
    let wall = 0;
    for (let rung = 1; rung <= LADDER_SIZE; rung += 1) {
        const foe = roadFighter(rung);
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
        if (wins / RUNS >= 0.5) wall = rung;
        else if (rung > wall + 8) break;
    }
    return wall;
}

const row = await db.queryOne(
    `SELECT id, display_name FROM mkt_buyer WHERE display_name = $1 OR alias = $1 LIMIT 1`, [WHO],
);
if (!row) throw new Error(`no member matching "${WHO}"`);
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const nowStats = await getEquippedStats(row.id);

// Scaling EVERY equipped stat by one number is the honest way to ask "what is more gear worth" without
// deciding for the player which stat they would raise. It is the same shape as replacing pieces with better
// pieces, which — since every tier is a stat stick — is exactly what upgrading is.
const STEPS = [1, 1.05, 1.1, 1.15, 1.25, 1.4, 1.6, 1.9, 2.3, 3, 4, 5, 6.5];
const rows = [];
for (const mult of STEPS) {
    const scaled = Object.fromEntries(Object.entries(nowStats).map(([k, v]) => [k, (Number(v) || 0) * mult]));
    const me = await kitFor(row.id, { equippedStats: scaled });
    rows.push({
        "gear x": mult === 1 ? "today" : `${mult}x`,
        "gear power": me.gearPower,
        health: Math.round(me.health),
        damage: Math.round(me.damage),
        "walls at rung": wallFor(me),
    });
}
console.log(`Exchange rate for ${row.display_name} — ${RUNS} bouts a rung, real loadout scaled.\n`);
console.table(rows);

// The headline: how much more gear buys the next ten rungs.
const base = rows[0];
const target = rows.find((r) => r["walls at rung"] >= base["walls at rung"] + 10);
if (target) {
    const factor = Number(String(target["gear x"]).replace("x", ""));
    console.log(`From rung ${base["walls at rung"]} to rung ${target["walls at rung"]}: ${target["gear x"]} gear`
        + ` (${base["gear power"]} -> ${target["gear power"]} power, +${Math.round((factor - 1) * 100)}%).`);
} else {
    console.log("Ten more rungs is past the top of the sweep.");
}
process.exit(0);
