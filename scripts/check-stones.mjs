// ── ARE STONES SCARCE ENOUGH, AND NOT TOO SCARCE? ────────────────────────────────────────────────────────────
// Luke named both failure modes: "I want it to end up in a place where people want them but don't have them",
// and "I definitely do not want it to end up in a place where people have a bunch of them and they can't use
// them." Those pull opposite ways, and the second is the binding one — a stone is only spendable on a level-6
// pet, and a level-6 pet is 42 days of work at the very cheapest.
//
// So the rate is not set against "how often does finding one feel good". It is set against HOW FAST PETS REACH
// SIX. The target: a dedicated player should find stones at roughly the pace they finish pets, and a casual one
// should find them slower than that but not never.
//
// Run:  node scripts/check-stones.mjs

import { STONE_SOURCES, STONE_PRICE_DOUBLOONS, STONE_PRICE_LAURELS } from "../src/lib/marketplace/pet-stones.js";
// pet-level.js is server-only (it talks to the DB), so the thresholds are restated here rather than imported.
// Same reason check-arena.mjs restates its constants: a test that imports the thing it is testing agrees with
// it by construction. If these two drift apart, that IS the signal.
const PET_BASE_THRESHOLDS = [0, 750, 3000, 6750, 12000, 30000];
const RARITY_MULT = { common: 1, rare: 1.3, epic: 1.7, legendary: 2.2, mythic: 2.8, ascendant: 3.6, eternal: 4.6 };
const petThresholds = (r) => PET_BASE_THRESHOLDS.map((t) => Math.round(t * (RARITY_MULT[r] || 1)));

// How often each source is actually REACHED, per day, by two kinds of member. These are activity rates, not
// drop rates — the whole point is that a rate is meaningless without knowing how often the door opens.
const PLAYERS = {
    dedicated: { mine_seam: 3, sail_dig: 2, boss_kill: 0.12, delve_boss: 3, petXpPerDay: 710 },
    casual: { mine_seam: 0.6, sail_dig: 0.4, boss_kill: 0.02, delve_boss: 0.7, petXpPerDay: 180 },
};

console.log("Stones a month, by where they come from:\n");
const totals = {};
for (const [who, rates] of Object.entries(PLAYERS)) {
    const parts = [];
    let perDay = 0;
    for (const [key, src] of Object.entries(STONE_SOURCES)) {
        const d = (rates[key] || 0) * src.chance;
        perDay += d;
        parts.push(`${key} ${(d * 30).toFixed(2)}`);
    }
    totals[who] = perDay;
    console.log(`  ${who.padEnd(10)} ${(perDay * 30).toFixed(2)} a month   (${parts.join(", ")})`);
}

console.log("\nAgainst how fast a pet actually reaches level 6 (only the EQUIPPED pet earns):");
const RARITIES = [["common", 1], ["epic", 1.7], ["legendary", 2.2], ["mythic", 2.8]];
let bad = 0;
for (const [who, rates] of Object.entries(PLAYERS)) {
    const stonesPerMonth = totals[who] * 30;
    for (const [rarity, mult] of RARITIES) {
        const need = Math.round(30000 * mult);
        const days = need / rates.petXpPerDay;
        const petsPerMonth = 30 / days;
        const ratio = petsPerMonth > 0 ? stonesPerMonth / petsPerMonth : Infinity;
        // A ratio near 1 is the goal: a stone arrives at about the rate a pet becomes ready for one.
        // Under 0.5 and the pet sits finished with nothing to spend; over 3 and stones pile up meaningless.
        const ok = ratio >= 0.5 && ratio <= 3;
        if (!ok) bad += 1;
        if (rarity === "epic" || rarity === "mythic") {
            console.log(`  ${who.padEnd(10)} ${rarity.padEnd(10)} pet ready every ${days.toFixed(0).padStart(3)} days`
                + `  → ${ratio.toFixed(1)} stones per pet finished  ${ok ? "ok" : "*** OUT OF THE 0.5-3 BAND ***"}`);
        }
    }
}

console.log("\nThe floor under the luck — if the dice never land, you can still buy one:");
console.log(`  Quartermaster  ${STONE_PRICE_DOUBLOONS.toLocaleString()} doubloons   (a won ship battle pays ~40, so ~23 wins)`);
console.log(`  Armoury        ${STONE_PRICE_LAURELS.toLocaleString()} laurels      (a bout pays ~35 either way, so ~170 bouts)`);
console.log("  Both are a month of deciding that is what you are saving for. Nobody buys one by accident.");

console.log("\nAnd the climb itself, for reference:");
for (const [rarity, mult] of RARITIES) {
    const t = petThresholds(rarity);
    console.log(`  ${rarity.padEnd(10)} Lv5 ${String(t[4]).padStart(6)}   Lv6 ${String(t[5]).padStart(6)}`);
}

console.log(bad ? `\n${bad} cell(s) outside the band — stones and pets are out of step.` : "\nStones arrive at about the rate pets become ready for them.");
process.exit(bad ? 1 : 0);
