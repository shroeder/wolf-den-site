// ── DOES ENSHRINING ACTUALLY DO ANYTHING? ────────────────────────────────────────────────────────────────────
// The one part of this feature with no other test: combinePetBonuses merging an enshrined pet's active while
// that pet sits in the box. If this is wrong the whole feature is a sprite and a paragraph.
//
// Three things it has to prove:
//   1. An UNEQUIPPED pet's active is worth nothing — which is the problem, and worth showing.
//   2. Enshrined, it is back: at full value under a Lightstone, half again under a Darkstone.
//   3. Enshrined AND equipped does not DOUBLE. The merge takes the higher, so carrying your own enshrined pet
//      around stops mattering — that is the promise, and adding would have quietly broken it.
//
// Run with the alias loader so `@/lib` resolves outside Next:
//   node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/check-enshrined-merge.mjs
import { combinePetBonuses } from "../src/lib/marketplace/pet-perks.js";
import { collectibleById } from "../src/lib/marketplace/collectibles.js";

const owned = ["bunny", "frog", "fox_kit", "wolf_pup", "eagle", "owl", "raven"].map(collectibleById).filter(Boolean);
const eagle = collectibleById("eagle");
const levels = Object.fromEntries(owned.map((p) => [p.id, 5]));
const cc = (b) => Math.round((b.stats.crit_chance || 0) * 10) / 10;
// MIGHT, not the sum of everything. The first version of this summed every stat — which includes the Eagle's
// own active — so a Darkstone appeared to "lift the whole pack" when all it had done was raise the one ability.
// The aura is a PASSIVE effect, so it has to be measured on a stat no active in the test touches.
const total = (b) => Math.round((b.stats.might || 0) * 10) / 10;

const equipped = combinePetBonuses(owned, eagle, levels, []);
const away = combinePetBonuses(owned, null, levels, []);
const light = combinePetBonuses(owned, null, levels, [{ petId: "eagle", stone: "light", pet: eagle }]);
const dark = combinePetBonuses(owned, null, levels, [{ petId: "eagle", stone: "dark", pet: eagle }]);
const both = combinePetBonuses(owned, eagle, levels, [{ petId: "eagle", stone: "dark", pet: eagle }]);

let bad = 0;
const check = (label, pass) => { if (!pass) bad += 1; console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`); };

console.log("The Eagle's active (crit chance), by what is true about it:\n");
console.log(`  equipped, not enshrined     ${cc(equipped)}`);
console.log(`  IN THE BOX, not enshrined   ${cc(away)}   <- gone. this is why people swap.`);
console.log(`  IN THE BOX + Lightstone     ${cc(light)}   <- back, at full value`);
console.log(`  IN THE BOX + Darkstone      ${cc(dark)}   <- and half again\n`);

check("an unequipped active is worth nothing without a stone", cc(away) < cc(equipped));
check("a Lightstone restores it in full", cc(light) >= cc(equipped) - 0.05);
check("a Darkstone is worth more than a Lightstone", cc(dark) > cc(light));
check("enshrined AND equipped does not double", cc(both) === cc(dark));

// ── THE PACK AURA IS GONE ────────────────────────────────────────────────────────────────────────────────────
// This used to assert that a Lightstone lifted every owned pet's passive. It did — by half a point on the
// biggest real collection in the Den, and by nothing at all on a small one, while being unbounded in principle.
// Deleted in favour of per-pet authored effects, so the assertion is INVERTED: neither stone may touch a pet it
// was not spent on. If a future change reintroduces a pack-wide multiplier this fails, which is the point.
console.log("\nNeither stone touches the rest of the pack any more:");
console.log(`  no stone    ${total(away)}`);
console.log(`  lightstone  ${total(light)}`);
console.log(`  darkstone   ${total(dark)}`);
// The Eagle's own effects are crit-flavoured, so MIGHT is untouched by either stone — which is exactly the
// property being tested: a stone spent on one pet does not raise an unrelated stat across the collection.
check("a Lightstone does not lift the whole pack", total(light) === total(away));
check("a Darkstone does not either", total(dark) === total(away));

console.log(bad ? `\n${bad} check(s) failed.` : "\nEnshrining does what it says on the card.");
process.exit(bad ? 1 : 0);
