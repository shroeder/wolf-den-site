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

console.log("\nThe Lightstone's pack aura, across every owned pet's passive:");
console.log(`  no stone    ${total(away)}`);
console.log(`  lightstone  ${total(light)}  (+${Math.round((total(light) / total(away) - 1) * 100)}%)`);
console.log(`  darkstone   ${total(dark)}  (the aura is Light-only, by design)`);
check("a Lightstone lifts the whole pack", total(light) > total(away));
check("a Darkstone does not", total(dark) <= total(away) + 0.05);

console.log(bad ? `\n${bad} check(s) failed.` : "\nEnshrining does what it says on the card.");
process.exit(bad ? 1 : 0);
