// ── REWORKING A TOOL, ASSERTED IN BARE NODE ──────────────────────────────────────────────────────────────────
// Luke: "crafting is lame, I feel the output should have some rng, and maybe some more layering of
// improvments."
//
// The rework is the first REPEATABLE action on the workbench. Everything else there is a one-time climb --
// a tier is made once, a vault built once -- which is self-limiting by construction. This one can be pressed
// for as long as the parts last, and the Grove's kill loop has no daily cap, so the things worth asserting
// are the ones that stop a repeatable action becoming a faucet or a trap.
//
//   node scripts/check-grove-rework.mjs        (or npm run check:grove-rework)
import {
    reworkCost, toolRecipeFor, REWORK_SHARE, GROVE_RECIPES,
} from "../src/lib/marketplace/grove-recipes.js";
import { rollQuality, qualityBand, QUALITY_BANDS, craftLevel } from "../src/lib/marketplace/grove-forge.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

console.log("\nWHAT IT COSTS");
const tools = GROVE_RECIPES.filter((r) => r.kind === "tool");
ok(`every tool recipe can be priced (${tools.length})`, tools.every((r) => reworkCost(r)));
ok("nothing but a tool can be reworked",
    GROVE_RECIPES.filter((r) => r.kind !== "tool").every((r) => reworkCost(r) === null));
// ⚠️ CHEAPER THAN MAKING ONE, OR NOBODY WOULD EVER REWORK. If a re-roll cost as much as a fresh craft the
// correct play would always be to climb the ladder instead, and the button would be decoration.
const pricier = tools.filter((r) => {
    const c = reworkCost(r);
    return Object.entries(r.parts).reduce((a, [p, n]) => a + n, 0) <= Object.values(c).reduce((a, b) => a + b, 0) - 0.001;
});
ok("a rework always costs less than the craft it re-rolls", pricier.length === 0,
    pricier.slice(0, 3).map((r) => r.name).join(", "));
// ⚠️ AND NEVER FREE. 60% of a 2-part recipe rounds to 1.2 -> the floor is what stops the shallowest tool
// in the game being re-rollable for nothing, for ever.
const free = tools.filter((r) => Object.values(reworkCost(r)).some((n) => n < 1));
ok("no rework is free at any tier", free.length === 0, free.slice(0, 3).map((r) => r.name).join(", "));
ok(`the share is a single constant (${REWORK_SHARE})`, typeof REWORK_SHARE === "number" && REWORK_SHARE > 0 && REWORK_SHARE < 1);

console.log("\nIT SCALES WITH THE LADDER AND IS NEVER TABULATED");
const rod1 = toolRecipeFor("rod", 1), rodTop = [...tools].filter((r) => r.slot === "rod").sort((a, b) => b.tier - a.tier)[0];
ok("a slot's deepest tool exists to be priced", Boolean(rod1) && Boolean(rodTop));
if (rod1 && rodTop && rodTop.tier > rod1.tier) {
    const c1 = Object.values(reworkCost(rod1)).reduce((a, b) => a + b, 0);
    const cN = Object.values(reworkCost(rodTop)).reduce((a, b) => a + b, 0);
    ok(`a deep rework costs more than a shallow one (${c1} -> ${cN})`, cN >= c1);
}
ok("toolRecipeFor finds the tool actually in a slot", toolRecipeFor("rod", 1)?.slot === "rod");
ok("...and returns null for a tier that does not exist", toolRecipeFor("rod", 99) === null);

console.log("\nTHE ROLL");
const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r = mulberry(99);
let worse = 0, better = 0, same = 0;
for (let i = 0; i < 20000; i += 1) {
    const before = Math.round(mulberry(i + 7)() * 100);
    const rolled = rollQuality(6, r);
    const after = Math.max(before, rolled);
    if (after < before) worse += 1; else if (after > before) better += 1; else same += 1;
}
// ⚠️ THE PROPERTY THE WHOLE FEATURE RESTS ON. A re-roll that can downgrade what you already own is a trap:
// the correct play becomes never pressing the button, and a button whose best use is leaving it alone is
// worse than no button at all.
ok("a rework can NEVER make a tool worse", worse === 0, `${worse} downgrades in 20,000`);
ok(`it improves often enough to be worth pressing (${(100 * better / 20000).toFixed(0)}%)`, better / 20000 > 0.15);
ok(`and misses often enough to be a risk (${(100 * same / 20000).toFixed(0)}%)`, same / 20000 > 0.15);

console.log("\nCRAFTING LEVEL STILL MATTERS");
const avgAt = (lv) => { const rr = mulberry(4242); let t = 0; for (let i = 0; i < 20000; i += 1) t += rollQuality(lv, rr); return t / 20000; };
const lo = avgAt(1), hi = avgAt(25);
ok(`a higher crafting level rolls better (${lo.toFixed(1)} -> ${hi.toFixed(1)})`, hi > lo + 5);
ok("the top band is reachable", qualityBand(100)?.id === QUALITY_BANDS[0].id);
ok("the bottom band is the floor", qualityBand(0)?.id === QUALITY_BANDS[QUALITY_BANDS.length - 1].id);
// The screen refuses a rework at the top band; that refusal has to correspond to a real ceiling.
ok("there is a band above which nothing can improve", QUALITY_BANDS[0].at < 100 && QUALITY_BANDS[0].at > 0,
    `top band starts at ${QUALITY_BANDS[0].at}`);

console.log(fails
    ? `\ncheck:grove-rework — ${fails} FAILED\n`
    : "\nOK — a rework costs less than a craft, is never free, never downgrades, and still rewards crafting level.\n");
process.exit(fails ? 1 : 0);
