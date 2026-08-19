// ── DOES FORGING THE SAME PIECE TWICE GIVE TWO DIFFERENT PIECES? ─────────────────────────────────────────────
// The forge picked its targets with `existing.slice(0, scenario)` — the first N affixes in the item's catalogue
// order, every time — so a piece's fate was fixed the moment it was authored. Affixes one and two grew on every
// enhance, and an affix in position five could never be touched at all, which on an eternal (born with five
// lines) or a primordial (six) froze a third of the piece for its whole life.
//
// It draws at random now. This replays the selection — the real rule out of crafting.js, not a description of
// it — over a full run of enhances, and reports where the points landed. Two things to look for: every affix
// should be reachable, and two runs on the same item should not come out the same.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-enhance-spread.mjs [itemId] [runs=200]
import { ITEMS, itemById, STAT_META, AFFIX_POOL, affixCeiling } from "../src/lib/marketplace/items.js";

const RUNS = Number(process.argv[3]) || 200;
const CAP_FRAC = 0.5;               // ENHANCE_CAP_FRAC
const MAX_LEVEL = 21;               // MAX_FORGE_LEVEL
const capOf = (item, k) => Math.max(3, Math.ceil((item.stats?.[k] || 0) * CAP_FRAC));

// The same draw crafting.js makes, minus the database and the minigame: `scenario` distinct stats, taken at
// random from the lines that still have room under their cap.
function forgeOnce(item, existing, bonus, scenario) {
    const draw = existing.filter((k) => (bonus[k] || 0) < capOf(item, k));
    const targets = [];
    while (targets.length < scenario && draw.length) {
        targets.push(draw.splice(Math.floor(Math.random() * draw.length), 1)[0]);
    }
    for (const k of targets) if ((bonus[k] || 0) < capOf(item, k)) bonus[k] = (bonus[k] || 0) + 1;
}

const pick = process.argv[2] || ITEMS.find((i) => i.rarity === "eternal" && i.slot === "main_hand")?.id;
const item = itemById(pick);
if (!item) throw new Error(`no item ${pick}`);
const existing = Object.keys(item.stats || {}).filter((k) => STAT_META[k] && AFFIX_POOL.includes(k));

console.log(`\n  ${item.name} — ${item.rarity}, born with ${existing.length} affixes, ceiling ${affixCeiling(item.rarity)}`);
console.log(`  ${existing.map((k, i) => `${i + 1}. ${STAT_META[k].label} ${item.stats[k]} (cap +${capOf(item, k)})`).join("   ")}\n`);

// A full life of forging, many times over, at a middling grade.
const totals = {};
const outcomes = new Set();
for (let r = 0; r < RUNS; r += 1) {
    const bonus = {};
    for (let lv = 0; lv < MAX_LEVEL; lv += 1) forgeOnce(item, existing, bonus, 2);
    for (const k of existing) totals[k] = (totals[k] || 0) + (bonus[k] || 0);
    outcomes.add(existing.map((k) => bonus[k] || 0).join(","));
}

console.log(`  after ${MAX_LEVEL} enhances, averaged over ${RUNS} runs:`);
for (const k of existing) {
    const got = totals[k] / RUNS;
    const cap = capOf(item, k);
    const bar = "█".repeat(Math.round((got / cap) * 22));
    console.log(`    ${STAT_META[k].label.padEnd(14)} +${got.toFixed(1).padStart(4)} of a possible +${String(cap).padEnd(3)} ${bar}`);
}
console.log(`\n  ${outcomes.size} distinct outcomes in ${RUNS} runs — ${outcomes.size === 1 ? "EVERY PIECE IDENTICAL" : "no two the same"}`);
const unreachable = existing.filter((k) => (totals[k] || 0) === 0);
console.log(unreachable.length
    ? `  UNREACHABLE: ${unreachable.map((k) => STAT_META[k].label).join(", ")} never gained a point`
    : "  every affix on the piece is reachable");
process.exit(0);
