// ── WALK THE ROAD WITH A REAL MEMBER'S LOADOUT ───────────────────────────────────────────────────────────────
// sim-road.mjs asks "is the Road walkable at all", using a synthetic fighter with a clean gear budget. This
// asks a different and more useful question: how far does THIS PERSON get, right now, with what they are
// actually wearing.
//
// It does NOT rebuild a fighter. It calls the game's own kitFor(), which is the function the Arena itself uses
// to build you — so the four stat sources the combat reads (gear, the skill tree, badges, pets) are all in,
// which is the whole reason a hand-built fighter would lie. The bout loop is the shared harness, which is the
// engine. Nothing in this file models combat.
//
// Uses app-loader, not alias-loader: this reaches kitFor, which pulls in the request-path libraries, so the
// Next runtime stubs are needed as well as the `server-only` no-op. app-loader is the one that has both.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-road-me.mjs "The Wolf Den" [runs]
import { ladderFoe, ladderDr, LADDER_SIZE } from "../src/lib/marketplace/arena-ladder.js";
import { statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { db } from "../src/lib/db.js";
import { bout } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || "The Wolf Den";
const RUNS = Number(process.argv[3]) || 200;

// The Road's fighters, built exactly as the game builds them (see sim-road.mjs for why ladderDr is included).
function roadFighter(rung) {
    const foe = ladderFoe(rung);
    const st = statsForPower(foe.power, foe.archetype, null, rung);
    const ring = ringStats({ ...st, dr: ladderDr(rung) });
    return {
        classId: null,
        // Mirrors arena.js: a champion is read a tier band up, which is where its edge now lives.
        abilities: npcAbilities(Math.max(1, Math.round(rung * 0.9) + (foe.champion ? 8 : 0)), foe.archetype),
        ...ring, damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
        name: foe.name, house: foe.houseName, champion: foe.champion, power: foe.power,
    };
}

const row = await db.queryOne(
    `SELECT id, display_name FROM mkt_buyer WHERE display_name = $1 OR alias = $1 LIMIT 1`, [WHO],
);
if (!row) throw new Error(`no member matching "${WHO}"`);

// The REAL loadout. kitFor is server-side and imports the database; the alias loader stubs `server-only`,
// which is exactly what it exists for.
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const me = await kitFor(row.id);
if (!me) throw new Error("kitFor returned nothing");

console.log(`Walking the Long Road as ${row.display_name} — ${RUNS} bouts per rung, real loadout, real engine.\n`);
console.log(`  class ${me.classId || "—"} · level ${me.level} · gear power ${me.gearPower}`);
console.log(`  health ${Math.round(me.health)} · damage ${Math.round(me.damage)} · crit ${Math.round((me.critChance || 0) * 100)}% x${(me.critMult || 0).toFixed(2)}`
    + ` · dr ${Math.round((me.dr || 0) * 100)}% · accuracy ${Math.round((me.accuracy || 0) * 100)}%\n`);

const rows = [];
let wall = 0, firstUnder = 0;
for (let rung = 1; rung <= LADDER_SIZE; rung += 1) {
    const foe = roadFighter(rung);
    let wins = 0;
    for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
    const w = wins / RUNS;
    if (w >= 0.5) wall = rung;
    if (!firstUnder && w < 0.5) firstUnder = rung;
    // Print the landmarks and everything near the edge, not all hundred.
    if (rung % 10 === 0 || (w > 0.02 && w < 0.98) || rung <= 3) {
        rows.push({ rung, foe: foe.name, house: foe.house, champ: foe.champion ? "★" : "",
            power: foe.power, foeHP: Math.round(foe.health), win: `${Math.round(w * 100)}%` });
    }
    if (w === 0 && rung > wall + 12) break; // past the wall by a mile; the rest is zeroes
}
console.table(rows);
console.log(`\nHighest rung ${row.display_name} still wins at least half the time: ${wall}`);
console.log(`First rung that goes against them:                            ${firstUnder || "—"}`);
process.exit(0);
