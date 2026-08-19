// ── THE NUMBER THE ROAD WAS TUNED WITHOUT ────────────────────────────────────────────────────────────────────
// Every balance pass on the Long Road measured a member's wall as "the highest rung they still take at least
// half the time". That is only a wall if losing costs something. A rung costs nothing — startBout exempts the
// Road from the ten-a-day allowance on purpose — so a rung won one try in five is a rung cleared in five tries,
// and the fighter walks straight through the wall the simulator drew.
//
// So the quantity that actually decides where somebody stops is not one rung, it is a BAND:
//
//   FAIR       the last rung they win at least half the time. What the curve intends.
//   REACHED    the last rung they win often enough to keep feeding attempts into. Measured here at 20%,
//              because that is what the Den actually did: Nicholas cleared rung 50 on his fourth attempt,
//              rung 51 on his fifth, rung 56 on his sixth, and was still going at 57.
//   BAND       REACHED − FAIR. Rungs bought with patience rather than power. This is the number to shrink.
//
// A band of zero would mean the Road is a readout of power, which is the whole brief. A band of thirteen —
// what it measured on the night this was written — means the back half of the Road is a slot machine.
//
// The fighter is the real one (kitFor), the foes are built exactly as the game builds them, and the bout is
// the shared harness. Nothing here models combat.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-road-retry-band.mjs "Nicholas" [runs]
import { ladderFoe, ladderDr, LADDER_SIZE } from "../src/lib/marketplace/arena-ladder.js";
import { statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { db } from "../src/lib/db.js";
import { bout } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || "Nicholas";
const RUNS = Number(process.argv[3]) || 300;
const FAIR = 0.5;
const KEEP_GOING = 0.2;

// ── CANDIDATE CURVES, WITHOUT TOUCHING THE LIVE ONE ──────────────────────────────────────────────────────────
// Levers are applied HERE, on top of what the game returns, so a candidate can be measured without editing
// arena-ladder.js and without a copy of its constants drifting out of step. No flags = the live curve exactly.
//
//   --dr-base / --dr-step   replace ladderDr's 0.04 + house*0.028. Damage reduction is the SHARPNESS lever: a
//                           fighter who cannot out-damage it loses decisively instead of nearly winning.
//   --tail                  multiply a rung's power by this per rung above the knee. The STEEPNESS lever.
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const DR_BASE = arg("--dr-base", null);
const DR_STEP = arg("--dr-step", null);
const TAIL_MULT = arg("--tail", null);
const KNEE = 30;
const drFor = (rung) => {
    if (DR_BASE === null && DR_STEP === null) return ladderDr(rung);
    const house = Math.floor((Math.max(1, Math.min(LADDER_SIZE, Math.round(rung))) - 1) / 10);
    return Math.round(((DR_BASE ?? 0.04) + house * (DR_STEP ?? 0.028)) * 1000) / 1000;
};
const powerFor = (rung, base) => (TAIL_MULT === null ? base : Math.round(base * Math.pow(TAIL_MULT, Math.max(0, rung - KNEE))));

function roadFighter(rung) {
    const foe = ladderFoe(rung);
    const st = statsForPower(powerFor(rung, foe.power), foe.archetype, null, rung);
    const ring = ringStats({ ...st, dr: drFor(rung) });
    return {
        classId: null,
        abilities: npcAbilities(Math.max(1, Math.round(rung * 0.9) + (foe.champion ? 8 : 0)), foe.archetype),
        ...ring, damage: ring.damage,
        perks: {}, lifesteal: 0, bleedChance: 0, burnChance: 0, dmgPct: 0, doublestrike: 0,
        gearPower: arenaRating(ring),
    };
}

const { kitFor } = await import("../src/lib/marketplace/arena.js");
const who = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!who) throw new Error(`no member called ${WHO}`);
const me = await kitFor(who.id);

const rate = [];
for (let rung = 1; rung <= LADDER_SIZE; rung += 1) {
    const foe = roadFighter(rung);
    let wins = 0;
    for (let i = 0; i < RUNS; i += 1) if (bout(me, foe).won) wins += 1;
    rate.push({ rung, p: wins / RUNS });
}

const lastAtLeast = (t) => {
    let last = 0;
    for (const r of rate) if (r.p >= t) last = r.rung;
    return last;
};
const fair = lastAtLeast(FAIR);
const reached = lastAtLeast(KEEP_GOING);

console.log(`\n${who.display_name} — rating ${arenaRating(me)}   [dr ${DR_BASE ?? "live"}/${DR_STEP ?? "live"} · tail ${TAIL_MULT ?? "live"}]\n`);
console.log("rung   win%    ");
for (const r of rate) {
    if (r.rung < Math.max(1, fair - 6) || r.rung > Math.min(LADDER_SIZE, reached + 6)) continue;
    const bar = "#".repeat(Math.round(r.p * 40));
    const tag = r.rung === fair ? "  <- FAIR (50%)" : r.rung === reached ? "  <- REACHED (20%)" : "";
    console.log(`${String(r.rung).padStart(4)}  ${(r.p * 100).toFixed(0).padStart(3)}%  ${bar}${tag}`);
}
console.log(`\nFAIR      ${fair}`);
console.log(`REACHED   ${reached}`);
console.log(`BAND      ${reached - fair}   <- rungs bought with retries, not power`);
console.log(`\nexpected attempts per rung across the band:`);
for (const r of rate) {
    if (r.rung <= fair || r.rung > reached) continue;
    console.log(`  rung ${String(r.rung).padStart(3)}  ${(r.p * 100).toFixed(0).padStart(3)}%  ~${(1 / Math.max(r.p, 0.001)).toFixed(1)} tries`);
}
process.exit(0);
