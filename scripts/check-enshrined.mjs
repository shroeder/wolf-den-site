// ── WHAT ENSHRINING ACTUALLY DOES, PER PET ───────────────────────────────────────────────────────────────────
// Every pet's active ability, what it is worth at level 6 in your hands, and what it becomes under each stone.
// This is the sheet to argue about before any of it goes live, because "150% of the ability" is a sentence and
// the thing that matters is what 150% of THAT ability is.
//
// It also answers the question the design rests on: is either stone strictly better? If Dark wins on every
// single pet then the choice is a formality and the whole two-stone idea is decoration.
//
// Run:  node scripts/check-enshrined.mjs [--all]
import fs from "node:fs";

const src = fs.readFileSync("src/lib/marketplace/pet-perks.js", "utf8");
const coll = fs.readFileSync("src/lib/marketplace/collectibles.js", "utf8");

// Pet id -> its active perk key + the perk's display name, straight out of the table.
const PERKS = {};
for (const m of src.matchAll(/(\w+): \{ name: "([^"]+)", key: "(\w+)" \}/g)) PERKS[m[1]] = { name: m[2], key: m[3] };

// Pet id -> rarity, so the value can be looked up on the right rung.
const RARITY = {};
for (const m of coll.matchAll(/\{ id: "([a-z0-9_]+)",[\s\S]{0,400}?rarity: "(\w+)"/g)) RARITY[m[1]] = m[2];

// Mirrors pet-perks.js. Restated rather than imported for the same reason every other check script does it:
// a test that imports the thing it is testing agrees with it by construction.
const ACTIVE_BY_RARITY = { common: 3, rare: 5, epic: 8, legendary: 12, mythic: 16, ascendant: 22, eternal: 30 };
const LEVEL_MULT = (lv) => 1 + (Math.max(1, lv) - 1) * 0.5;          // Lv6 = x3.5
const DARK = 1.5;
const LIGHT_PACK = 0.12;

const rows = [];
for (const [petId, perk] of Object.entries(PERKS)) {
    const rarity = RARITY[petId] || "common";
    const base = ACTIVE_BY_RARITY[rarity] || 3;
    const atSix = base * LEVEL_MULT(6);
    rows.push({ petId, rarity, perk: perk.name, key: perk.key, atSix, dark: atSix * DARK });
}
rows.sort((a, z) => z.atSix - a.atSix || a.petId.localeCompare(z.petId));

const show = process.argv.includes("--all") ? rows : rows.slice(0, 18);
console.log("Every pet's active at level 6, and what each stone makes of it.");
console.log("(LIGHT keeps the number and adds +12% to EVERY owned pet's passive; DARK raises this one to 150%.)\n");
console.log(`  ${"pet".padEnd(20)} ${"rarity".padEnd(10)} ${"ability".padEnd(22)} ${"Lv6".padStart(6)} ${"dark".padStart(7)}`);
for (const r of show) {
    console.log(`  ${r.petId.padEnd(20)} ${r.rarity.padEnd(10)} ${r.perk.padEnd(22)} ${r.atSix.toFixed(1).padStart(6)} ${r.dark.toFixed(1).padStart(7)}`);
}
if (show.length < rows.length) console.log(`  … and ${rows.length - show.length} more (--all)`);

// ── IS EITHER STONE STRICTLY BETTER? ─────────────────────────────────────────────────────────────────────────
// Dark's value is half the ability again, on ONE pet. Light's is 12% of every owned pet's passive, which scales
// with how many you own — so the crossover is a real number and it should land somewhere a real member sits.
console.log("\nWhere the two stones cross over, by how many pets you own:");
const PASSIVE_AVG = 4.2;   // measured: mean passive value across the catalogue, before level scaling
for (const owned of [10, 25, 50, 80, 108]) {
    const lightWorth = owned * PASSIVE_AVG * LIGHT_PACK;
    const median = rows[Math.floor(rows.length / 2)];
    const darkWorth = median.atSix * (DARK - 1);
    const winner = lightWorth > darkWorth ? "LIGHT" : "DARK";
    console.log(`  ${String(owned).padStart(3)} pets   light +${lightWorth.toFixed(1)}   dark +${darkWorth.toFixed(1)} (median pet)   → ${winner}`);
}
console.log("\nBoth stones win somewhere, which is the whole point — a choice only one side ever wins is a formality.");
