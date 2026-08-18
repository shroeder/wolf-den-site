// ── IS EVERY ARCHETYPE THE SAME DIFFICULTY AT THE SAME POWER? ────────────────────────────────────────────────
// The Road rotates archetypes rung by rung, so two neighbouring fighters on nearly identical power budgets are
// supposed to be different PROBLEMS — not different difficulties. Walking it with a real loadout showed they
// are both: rung 82 (Duelist, 805hp) came in at 74% and rung 83 (Wall, 1489hp) at 98%, one rung apart.
//
// That is the sawtooth. This measures it directly: one fighter, one power budget, every archetype, so the
// spread is a number instead of an impression.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-archetypes.mjs "The Wolf Den" [power]
import { ARCHETYPES, statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { ladderDr } from "../src/lib/marketplace/arena-ladder.js";
import { db } from "../src/lib/db.js";
import { bout } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || "The Wolf Den";
const RUNS = 400;
const POWERS = process.argv[3] ? [Number(process.argv[3])] : [200, 400, 600, 800];

const row = await db.queryOne(
    `SELECT id, display_name FROM mkt_buyer WHERE display_name = $1 OR alias = $1 LIMIT 1`, [WHO],
);
if (!row) throw new Error(`no member matching "${WHO}"`);
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const me = await kitFor(row.id);

function foeAt(power, archKey, rung = 50) {
    const st = statsForPower(power, archKey, null, rung);
    const ring = ringStats({ ...st, dr: ladderDr(rung) });
    return {
        classId: null, abilities: npcAbilities(10), ...ring, damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
    };
}

console.log(`Archetype spread as ${row.display_name} — ${RUNS} bouts a cell.`);
console.log("Each row is ONE power budget spent through each archetype's weights. A flat row is the goal:");
console.log("same power should mean same difficulty, and the archetype should change HOW you win, not whether.\n");

const rows = [];
for (const power of POWERS) {
    const r = { power };
    let lo = 1, hi = 0;
    for (const a of ARCHETYPES) {
        const foe = foeAt(power, a.key);
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
        const w = wins / RUNS;
        r[a.name] = `${Math.round(w * 100)}%`;
        lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
    r.spread = `${Math.round((hi - lo) * 100)}pts`;
    rows.push(r);
}
console.table(rows);
console.log("`spread` is the gap between the easiest and hardest archetype at that power — it IS the sawtooth.");
process.exit(0);
