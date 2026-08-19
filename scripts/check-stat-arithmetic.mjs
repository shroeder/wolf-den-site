// ── WHAT DOES A POINT DO TO THE NUMBERS, BEFORE ANY FIGHT HAPPENS? ───────────────────────────────────────────
// check-stat-value.mjs answers "what is a point worth" by playing thousands of bouts, which is the right way to
// compare stats but the wrong way to UNDERSTAND one: a win rate cannot tell you whether a stat did nothing
// because the formula gives it nothing, or because it gave it plenty and the fights did not care.
//
// So this does the arithmetic instead, on a real member, one stat at a time: what the sheet says before, what
// it says after, and what that is as a share of the thing the stat is supposed to move. No RNG, nothing to
// argue with.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-stat-arithmetic.mjs [name] [budget=25]
import { fighterFrom, combatStats } from "../src/lib/marketplace/arena.js";
import { autoBout } from "../src/lib/marketplace/arena-engine.js";
import { getEquippedStats, getEquippedIds } from "../src/lib/marketplace/inventory.js";
import { mergeStats } from "../src/lib/marketplace/items.js";
import { db } from "../src/lib/db.js";

const WHO = process.argv[2] || "The Wolf Den";
const BUDGET = Number(process.argv[3]) || 25;

const me = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [WHO]);
if (!me) throw new Error(`no member called ${WHO}`);
const bySlot = await getEquippedIds(me.id);
const ids = Object.values(bySlot || {}).filter(Boolean);
const stats = await combatStats(me.id, await getEquippedStats(me.id), ids);
const base = fighterFrom(stats, {}, null);

console.log(`\n  ${me.display_name}, as they stand:`);
console.log(`    damage ${Math.round(base.damage)}   health ${base.health}   armour ${base.armor}   speed ${base.speed.toFixed(3)}/s`);
console.log(`    crit ${(base.critChance * 100).toFixed(1)}% of swings, each worth ${base.critMult.toFixed(2)}x`);
console.log(`\n  what +${BUDGET} of each stat does to those numbers:\n`);

// Each row: the sheet field the stat moves, and how to say what it did in a sentence.
const ROWS = [
    ["might", (f) => `damage ${Math.round(base.damage)} -> ${Math.round(f.damage)}  (+${(((f.damage / base.damage) - 1) * 100).toFixed(1)}% damage)`],
    ["vitality", (f) => `health ${base.health} -> ${f.health}  (+${(((f.health / base.health) - 1) * 100).toFixed(1)}% health)`],
    ["armor", (f) => `armour ${base.armor} -> ${f.armor}  (+${(((f.armor / base.armor) - 1) * 100).toFixed(1)}%)`],
    ["tenacity", (f) => `armour ${base.armor} -> ${f.armor}  (+${(((f.armor / base.armor) - 1) * 100).toFixed(1)}%)`],
    ["ferocity", (f) => `speed ${base.speed.toFixed(3)} -> ${f.speed.toFixed(3)}/s  (+${(((f.speed / base.speed) - 1) * 100).toFixed(1)}% more swings)`],
    ["crit_chance", (f) => `crit ${(base.critChance * 100).toFixed(1)}% -> ${(f.critChance * 100).toFixed(1)}% of swings  (+${((f.critChance - base.critChance) * 100).toFixed(1)} points of chance)`],
    ["crit_power", (f) => `crit worth ${base.critMult.toFixed(2)}x -> ${f.critMult.toFixed(2)}x, but only on ${(base.critChance * 100).toFixed(1)}% of swings  (= +${(((base.critChance * (f.critMult - base.critMult))) * 100).toFixed(2)}% average damage)`],
    ["pierce", (f) => `ignores ${(Math.min(1, base.pierce * 0.005) * 100).toFixed(1)}% -> ${(Math.min(1, f.pierce * 0.005) * 100).toFixed(1)}% of their armour`],
    ["lifesteal", (f) => `heals ${(base.lifesteal * 0.0025 * 100).toFixed(2)}% -> ${(f.lifesteal * 0.0025 * 100).toFixed(2)}% of what you deal`],
    ["counter", (f) => `strikes back ${(base.counter * 0.0025 * 100).toFixed(2)}% -> ${(f.counter * 0.0025 * 100).toFixed(2)}% of the time`],
    ["doublestrike", (f) => `swings twice ${(base.doublestrike * 0.005 * 100).toFixed(2)}% -> ${(f.doublestrike * 0.005 * 100).toFixed(2)}% of the time`],
    ["stun", (f) => `stuns ${(base.stun * 0.005 * 100).toFixed(2)}% -> ${(f.stun * 0.005 * 100).toFixed(2)}% of blows`],
    ["haste", (f) => `hastes ${(base.haste * 0.005 * 100).toFixed(2)}% -> ${(f.haste * 0.005 * 100).toFixed(2)}% of swings`],
];
for (const [stat, say] of ROWS) {
    const f = fighterFrom(mergeStats(stats, { [stat]: BUDGET }), {}, null);
    console.log(`    ${stat.padEnd(14)} ${say(f)}`);
}

// ── AND THE ONE THAT NEEDS A FIGHT TO SHOW ───────────────────────────────────────────────────────────────────
// Speed does not change any number on the sheet except its own, so what it is worth has to be counted in
// blows landed. Against a sparring partner built off this fighter, at several sizes of investment, so the
// shape of the return is visible rather than one point on it.
console.log("\n  what speed actually buys, counted in a fight:");
const dummy = { damage: Math.round(base.damage * 0.9), health: base.health, armor: Math.round(base.armor * 0.9),
    speed: base.speed, critChance: 0.05, critMult: 1.25, blockChance: 0, blockReduction: 0.35 };
const seeded = (n) => () => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
for (const add of [0, 25, 100, 250, 500]) {
    const f = fighterFrom(mergeStats(stats, { ferocity: add }), {}, null);
    let won = 0;
    let swings = 0;
    for (let s = 0; s < 60; s += 1) {
        const r = autoBout({ ...f }, { ...dummy }, { rng: seeded(3001 + s * 7919)() });
        if (r.won) won += 1;
        swings += r.swings;
    }
    console.log(`    +${String(add).padStart(3)} ferocity -> speed ${f.speed.toFixed(3)}/s   won ${String(won).padStart(2)}/60   ${(swings / 60).toFixed(1)} swings a bout`);
}
process.exit(0);
