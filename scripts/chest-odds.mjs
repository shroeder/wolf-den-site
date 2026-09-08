// ── WHAT A CHEST ACTUALLY PAYS, PER TIER ─────────────────────────────────────────────────────────────────────
// A chest resolves as a CHAIN of independent rolls, first match wins: recipe, then seeds, then a pet, a gem, a
// forge scroll, a consumable, and only what falls through all of that reaches the gear pool the chest exists
// for. Each of those chances was tuned on its own, and once they all RAN UPWARD with tier they compounded
// into the opposite of what each line intended: the richer the chest, the more ways there were to be
// intercepted before the gear roll ever happened. A primordial chest reached its gear pool 9.8% of the time
// and paid seeds 23.1% — which is how Jinxx opened the rarest chest in the game and got five seeds.
//
// Nobody can hold six compounding curves in their head, which is the whole reason this exists. Run it before
// touching any chest rate, the way arena-report is run before touching a bout.
//
//   node scripts/chest-odds.mjs
//
// It reads the tables out of the source rather than restating them, so it cannot drift from what ships.
import { readFileSync } from "node:fs";

const SRC = readFileSync("src/lib/marketplace/chests.js", "utf8");
const PETS = readFileSync("src/lib/marketplace/pet-drops.js", "utf8");

// Pull a `const NAME = { ... };` object literal out of the source and evaluate just that literal.
const table = (src, name) => {
    const i = src.indexOf(`const ${name} = `);
    if (i < 0) throw new Error(`no table called ${name}`);
    const open = src.indexOf("{", i);
    let depth = 0, end = open;
    for (let j = open; j < src.length; j += 1) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") { depth -= 1; if (!depth) { end = j; break; } }
    }
    // eslint-disable-next-line no-new-func
    return new Function(`return ${src.slice(open, end + 1)}`)();
};
const number = (src, name) => Number(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)`).exec(src)?.[1]);

const RECIPE = table(SRC, "RECIPE_CHANCE");
const SEED = table(SRC, "SEED_CHANCE");
const SEED_N = table(SRC, "SEED_COUNT");
const GEM = table(SRC, "GEM_CHEST_CHANCE");
const SCROLL = table(SRC, "SCROLL_CHEST_CHANCE");
const CONS = table(SRC, "CHEST_CONSUMABLES");
const PET_BASE = number(PETS, "CHEST_PET_BASE");
const PET_STEP = number(PETS, "CHEST_PET_STEP");
const PET_CAP = number(PETS, "CHEST_PET_CAP");

const TIERS = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];
// Which seed table each tier draws from. Kept in step with the line in openChest by hand, which is the one
// thing in here that CAN drift -- so it is one expression, next to the tables it explains.
const seedBandOf = (t) => (t === "wooden" ? "chest_wooden"
    : t === "iron" ? "chest_iron"
    : (t === "ascendant" || t === "eternal") ? "chest_high"
    : "chest_gold");

const pct = (n) => `${(n * 100).toFixed(1)}%`.padStart(6);

console.log("\nWhat one chest pays, by tier. First match wins, so each row eats the ones below it.\n");
console.log("  tier          recipe   seeds     pet     gem  scroll  consum    GEAR   seed table");
console.log("  " + "-".repeat(88));

const rows = [];
for (const t of TIERS) {
    const idx = TIERS.indexOf(t);
    const steps = [
        ["recipe", RECIPE[t] || 0],
        ["seeds", SEED[t] || 0],
        ["pet", Math.min(PET_CAP, PET_BASE + idx * PET_STEP)],
        ["gem", GEM[t] || 0],
        ["scroll", SCROLL[t] || 0],
        ["consum", CONS[t]?.chance || 0],
    ];
    let left = 1;
    const got = {};
    for (const [k, p] of steps) { got[k] = left * p; left -= got[k]; }
    got.gear = left;
    rows.push({ t, ...got, band: seedBandOf(t) });
    console.log(`  ${t.padEnd(12)}${pct(got.recipe)}  ${pct(got.seeds)}  ${pct(got.pet)}  ${pct(got.gem)}`
        + `  ${pct(got.scroll)}  ${pct(got.consum)}  ${pct(got.gear)}   ${seedBandOf(t)}`);
}

// The thing that went wrong once and could go wrong again: seeds are a SUPPLY, so their share must fall as
// the chest gets rarer. If this ever reads the other way round, a top chest is paying out filler again.
console.log("\n  Seeds are a supply, so their share must FALL as the chest gets rarer:\n");
let worst = null;
for (const r of rows) {
    const share = r.seeds / Math.max(0.0001, r.gear);
    const line = `  ${r.t.padEnd(12)} seeds ${pct(r.seeds)}  gear ${pct(r.gear)}   `
        + `${share < 0.01 ? "no seeds at all" : `${share.toFixed(2)}x as often as gear`}`
        + `${r.seeds > 0 ? `, ${SEED_N[r.t]} of them from ${r.band}` : ""}`;
    console.log(line);
    if (worst === null || share > worst.share) worst = { t: r.t, share };
}
const climbing = rows.some((r, i) => i > 0 && r.seeds > rows[i - 1].seeds + 0.005);
console.log(`\n  ${climbing ? "WRONG WAY: seed share climbs with tier somewhere above." : "Right way round."}`
    + ` Heaviest seed tier is ${worst.t}.`);
console.log(`  Gear runs ${pct(rows[0].gear)} on a wooden chest down to ${pct(rows[rows.length - 1].gear)} on a primordial,`);
console.log(`  which is deliberate: the top chests trade gear for relics, scrolls, pets and gems, not for filler.\n`);
