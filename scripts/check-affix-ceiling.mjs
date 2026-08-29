// ── HOW MUCH OF AN AFFIX CAN A PERSON ACTUALLY GET? ──────────────────────────────────────────────────────────
// "Three items carry Lifedrink and they are all celestial" is a fact about the catalogue, not a ceiling. The
// forge can add an affix a piece was not born with, and the reroll can MOVE a forged value onto a stat the
// piece does not have at all — carrying the whole value, deliberately uncapped, because a swap relocates points
// already earned rather than awarding new ones. So the real ceiling is a sum over ten slots of three different
// routes, and guessing at it is how a stat gets called dead when it is only awkward, or called fine when
// nobody can reach it.
//
// The three routes, per slot:
//   BORN     the affix is on the item in the catalogue.
//   FORGED   an empty socket filled by an enhance. capOf = max(3, ceil(base x 0.5)), and base is 0 for a stat
//            the piece does not have — so this route is always exactly +3.
//   SWAPPED  forge some OTHER stat to its cap, then reroll that line onto this affix. The whole value moves and
//            the per-stat cap does not apply, so this route is worth max(3, ceil(bestOtherBase x 0.5)).
//
// A socket has to be free for the forged route (affixCeiling - born - alreadyForged), and the reroll is a
// weighted random draw, not a choice — the ceiling below is what is REACHABLE, not what is likely.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-affix-ceiling.mjs [affix=lifesteal]
import { ITEMS, STAT_META, EQUIP_SLOTS, affixCeiling, AFFIX_POOL } from "../src/lib/marketplace/items.js";

const AFFIX = process.argv[2] || "lifesteal";
const CAP_FRAC = 0.5;                                   // ENHANCE_CAP_FRAC in crafting.js
const capOf = (base) => Math.max(3, Math.ceil((Number(base) || 0) * CAP_FRAC));
const affixKeys = (it) => Object.keys(it.stats || {}).filter((k) => STAT_META[k] && AFFIX_POOL.includes(k));

// Per item: what this affix could be worth if everything went right.
function ceilingFor(it) {
    const born = Number(it.stats?.[AFFIX]) || 0;
    const keys = affixKeys(it);
    const socketFree = affixCeiling(it.rarity) - keys.length > 0;
    // The biggest line on the piece that is NOT the affix itself — that is the one worth forging up and moving.
    const bestOther = Math.max(0, ...keys.filter((k) => k !== AFFIX).map((k) => capOf(it.stats[k])));
    const forged = born ? capOf(born) : (socketFree ? 3 : 0);   // an existing line can be forged up; an empty socket gives +3
    const swapped = bestOther;                                   // and a swap can land the whole of the best forged line here
    return { born, forged, swapped, best: born + Math.max(forged, swapped), socketFree };
}

// The best a single loadout could reach: one item per slot, chosen for this affix.
function bestLoadout(rarities) {
    let total = 0;
    const picks = [];
    for (const s of EQUIP_SLOTS) {
        const pool = ITEMS.filter((i) => i.slot === s.accepts && rarities.includes(i.rarity) && i.stats);
        if (!pool.length) continue;
        let best = null;
        for (const it of pool) {
            const c = ceilingFor(it);
            if (!best || c.best > best.c.best) best = { it, c };
        }
        if (best) { total += best.c.best; picks.push(`${s.slot}:${best.c.best}`); }
    }
    return { total, picks };
}

const m = STAT_META[AFFIX];
console.log(`\n── ${(m?.label || AFFIX).toUpperCase()} — WHAT IS REACHABLE ─────────────────────────────`);
console.log(`  ${m?.desc || ""}\n`);

const carriers = ITEMS.filter((i) => i.stats?.[AFFIX]);
console.log(`  carried in the catalogue by ${carriers.length} item(s): ${carriers.map((i) => `${i.name} +${i.stats[AFFIX]} (${i.rarity})`).join(", ") || "none"}`);

const BANDS = [
    ["what the Den wears now", ["legendary", "mythic"]],
    ["everything below celestial", ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal"]],
    ["every item in the game", ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"]],
];
console.log("\n  a full ten-slot loadout, every roll going your way:");
for (const [label, rarities] of BANDS) {
    const b = bestLoadout(rarities);
    console.log(`    ${label.padEnd(28)} ${String(b.total).padStart(4)} points`);
}

// What the points are worth once the engine has them, so the ceiling is in the same units as the class trees.
const PER_POINT = { lifesteal: 0.0025, pierce: 0.005, counter: 0.0025, stun: 0.005, haste: 0.005 };
if (PER_POINT[AFFIX]) {
    console.log(`\n  at ${(PER_POINT[AFFIX] * 100).toFixed(2)}% a point, that ceiling is:`);
    for (const [label, rarities] of BANDS) {
        const b = bestLoadout(rarities);
        console.log(`    ${label.padEnd(28)} ${(b.total * PER_POINT[AFFIX] * 100).toFixed(1)}%`);
    }
}
process.exit(0);
