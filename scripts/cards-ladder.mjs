// ── WHAT THE CARD LADDER ACTUALLY GIVES YOU, RUNG BY RUNG ────────────────────────────────────────────
// Every level must hand over something, the early perk pool must not be starved by the gating, and the
// four pets must land where Luke asked. Run it after touching RANKS, PERK_LEVELS or LEVEL_PETS.
//   node scripts/cards-ladder.mjs
import { RANKS, PERK_IDS, PERK_LEVELS, LEVEL_PETS, openPerkIds, levelRewards, UNLOCKS, PERKS, ALL_CARDS }
    from "@/lib/marketplace/cards-kit.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

const WIN = 825, DEATH = 150;   // measured: a three-act win and a typical death
let bad = 0;
console.log("lvl  name              xp      +runs   pool   unlocks");
for (const r of RANKS) {
    const rw = levelRewards(r.level);
    const prev = RANKS.find((x) => x.level === r.level - 1);
    const gap = prev ? r.xp - prev.xp : 0;
    const runs = prev ? (gap / ((WIN + DEATH * 3) / 4)).toFixed(1) : "-";
    const gives = [
        ...rw.cards.map((id) => `card ${UNLOCKS[id]?.name || id}`),
        ...rw.perks.map((id) => `perk ${PERKS[id]?.name || id}`),
        ...(rw.pet ? [`PET ${collectibleById(rw.pet)?.name || rw.pet}`] : []),
    ];
    if (r.level > 1 && !gives.length) { bad++; gives.push("<- NOTHING"); }
    console.log(`${String(r.level).padStart(3)}  ${r.name.padEnd(16)} ${String(r.xp).padStart(6)}  ${String(runs).padStart(5)}   ${String(openPerkIds(r.level).length).padStart(4)}   ${gives.join(" · ")}`);
}
console.log(`\nperk pool: ${openPerkIds(1).length} at rank 1 -> ${openPerkIds(20).length} at rank 20 (of ${PERK_IDS.length})`);
console.log(`gated perks: ${Object.keys(PERK_LEVELS).length}, all present: ${Object.keys(PERK_LEVELS).every((id) => PERKS[id]) ? "yes" : "NO"}`);
for (const [lv, pet] of Object.entries(LEVEL_PETS)) {
    const def = collectibleById(pet);
    const card = Object.values(ALL_CARDS).find((c) => c.pet === pet);
    console.log(`  lvl ${String(lv).padStart(2)}  ${(def?.name || "MISSING").padEnd(18)} ${(def?.rarity || "?").padEnd(10)} card: ${card?.name || "MISSING"}`);
    if (!def || !card) bad++;
}
const toWin = (lv) => Math.ceil((RANKS.find((r) => r.level === lv)?.xp || 0) / WIN);
console.log(`\nwins to reach a pet: lvl3 ~${toWin(3)}  lvl5 ~${toWin(5)}  lvl10 ~${toWin(10)}  lvl15 ~${toWin(15)}`);
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nevery rung gives something, both tables resolve");
