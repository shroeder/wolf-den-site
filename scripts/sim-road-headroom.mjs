// ── HOW FAR CAN THIS PERSON ACTUALLY GROW? ───────────────────────────────────────────────────────────────────
// "Is it realistic to grow your way naturally to rung 50, 60 etc via gear improvements and class skills?"
//
// Gear cannot answer that on its own: the budget stops at 644 and the owner is already at 631, so there is
// almost nothing left in the wardrobe. The question is really about the OTHER lanes — the skill tree, forge
// enhancement, gems — and the only honest way to answer is to build the same person with each lane filled and
// walk the Road with them.
//
// Every variant starts from the REAL fighter (kitFor) and changes exactly one thing, so the difference between
// two rows is the value of that lane and nothing else.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/sim-road-headroom.mjs "The Wolf Den" [runs]
import { ladderFoe, ladderDr, LADDER_SIZE } from "../src/lib/marketplace/arena-ladder.js";
import { statsForPower, npcAbilities } from "../src/lib/marketplace/arena-npc.js";
import { arenaRating, ringStats } from "../src/lib/marketplace/arena-engine.js";
import { treeFor } from "../src/lib/marketplace/arena-classes.js";
import { itemById } from "../src/lib/marketplace/items.js";
import { getEquippedIds, getEquippedStats } from "../src/lib/marketplace/inventory.js";
import { db } from "../src/lib/db.js";
import { bout } from "./lib/sim-harness.mjs";

const WHO = process.argv[2] || "The Wolf Den";
const RUNS = Number(process.argv[3]) || 150;

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

const row = await db.queryOne(
    `SELECT id, display_name FROM mkt_buyer WHERE display_name = $1 OR alias = $1 LIMIT 1`, [WHO],
);
if (!row) throw new Error(`no member matching "${WHO}"`);
const { kitFor } = await import("../src/lib/marketplace/arena.js");
const me = await kitFor(row.id);

// The same person with a FINISHED tree — rebuilt by the GAME, through kitFor's own skillTree override.
// The first attempt at this patched the derived numbers by hand and reported 203 health against a real 413,
// because the tree and the arena upgrades share one perk bag and subtracting the tree took the upgrades with
// it. Anything that re-derives a stat outside kitFor is going to be wrong in some way nobody notices.
const fullTree = (() => {
    const taken = {};
    for (const n of treeFor(me.classId)) taken[n.id] = Math.max(1, Number(n.ranks) || 1);
    return taken;
})();
const spentNow = Object.values(me.taken || {}).reduce((s, n) => s + (Number(n) || 0), 0);
const spentFull = Object.values(fullTree).reduce((s, n) => s + (Number(n) || 0), 0);
const full = await kitFor(row.id, { skillTree: fullTree });

// ── AND THE WARDROBE, FULLY WORKED ───────────────────────────────────────────────────────────────────────────
// Base gear is capped and the owner is at it. What is NOT capped is what you put INTO the gear: the Forge lets
// every stat be raised by half its base again (ENHANCE_CAP_FRAC), and his equipped pieces sit at +2 to +7 of a
// possible +15 with one socket filled out of ten.
//
// This projects the Forge lane at its ceiling — every equipped stat at its per-stat cap — on top of whatever
// he already has, and hands it to kitFor as the wardrobe. Gems are deliberately NOT projected: their value
// depends on which gems, and overstating a lane while measuring it is how a balance answer becomes a wish.
const eqIds = Object.values(await getEquippedIds(row.id)).filter(Boolean);
const nowStats = await getEquippedStats(row.id);
// SUMMED ACROSS THE TEN PIECES, not maxed. The first cut compared a single item's projected total against
// `nowStats`, which is already the sum of all ten — so the max was always the existing figure and the row came
// back byte-identical to today's, quietly reporting that the Forge is worth nothing.
const forgedStats = { ...nowStats };
const forgeAdd = {};
for (const id of eqIds) {
    const base = itemById(id)?.stats || {};
    for (const [k, v] of Object.entries(base)) {
        const cap = Math.max(3, Math.ceil((Number(v) || 0) * 0.5)); // ENHANCE_CAP_FRAC
        forgeAdd[k] = (forgeAdd[k] || 0) + cap;
    }
}
// Whatever the Forge has already given him is inside `nowStats`, so the ceiling is base + the full cap — take
// the higher of that and what he holds, per stat, rather than stacking his existing enhance on top of the cap.
const baseTotal = {};
for (const id of eqIds) for (const [k, v] of Object.entries(itemById(id)?.stats || {})) baseTotal[k] = (baseTotal[k] || 0) + (Number(v) || 0);
for (const k of Object.keys(forgeAdd)) {
    forgedStats[k] = Math.max(Number(nowStats[k]) || 0, (baseTotal[k] || 0) + forgeAdd[k]);
}
const forged = await kitFor(row.id, { equippedStats: forgedStats });
const bothMaxed = await kitFor(row.id, { equippedStats: forgedStats, skillTree: fullTree });

function walk(fighterMe) {
    let wall = 0;
    for (let rung = 1; rung <= LADDER_SIZE; rung += 1) {
        const foe = roadFighter(rung);
        let wins = 0;
        for (let i = 0; i < RUNS; i += 1) if (bout(fighterMe, foe).won) wins += 1;
        if (wins / RUNS >= 0.5) wall = rung;
        else if (rung > wall + 8) break;
    }
    return wall;
}

console.log(`Growth headroom for ${row.display_name} — ${RUNS} bouts a rung, real loadout via kitFor.\n`);
console.log(`  skill points spent: ${spentNow} of ${spentFull} available
`);

const rows = [
    { lane: "as they are today", me },
    { lane: "+ every piece fully forged", me: forged },
    { lane: "+ finished skill tree", me: full },
    { lane: "+ both", me: bothMaxed },
];
console.table(rows.map((r) => ({
    loadout: r.lane,
    health: Math.round(r.me.health),
    damage: Math.round(r.me.damage),
    "crit%": Math.round((r.me.critChance || 0) * 100),
    "crit x": (r.me.critMult || 0).toFixed(2),
    "dr%": Math.round((r.me.dr || 0) * 100),
    "walls at rung": walk(r.me),
})));
process.exit(0);
