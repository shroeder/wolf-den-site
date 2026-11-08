// ── DOES THE KILL BAR ACTUALLY PAY WHAT IT PROMISES? ─────────────────────────────────────────────────────────
// Luke, 2026-11-08: "You kill enemies in an area. A bar fills. It reaches full. You get a reward. The reward
// is a crafting tool. The bar resets, you repeat. The reward is each crafting tool of that zone tier. Once you
// have all tools. It becomes a low level chest, with a chance to roll higher."
//
// The bar is the ONLY source of Grove tools, and twelve systems read groveToolPct — so a bar that stalls, or
// skips a slot, or never leaves the tool phase, is twelve systems silently stuck at +0%. None of that is
// visible in a screenshot and none of it throws: you would have to farm 3,000 kills to find it by playing.
//
// So this drives the pure halves of grove-bar.js directly. It cannot touch bumpBar, which writes rows — what
// it can do is prove the three rules that decide what bumpBar pays, which is where the arithmetic lives.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-grove-bar.mjs
import { barCeiling, rollBarChest, nextToolFor, BAR_KILLS } from "../src/lib/marketplace/grove-bar.js";
import { TOOL_SLOTS } from "../src/lib/marketplace/grove-recipes.js";
import { CHEST_ORDER } from "../src/lib/marketplace/chests.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};

console.log("\nTHE TOOL PHASE ENDS, AND IT ENDS AFTER EXACTLY TWELVE");
// ⚠️ SIMULATED THE WAY bumpBar DOES IT — tracking the grant in memory between fills. The bug this catches is
// nextToolFor being asked twice without the first grant landing, which would hand out the same slot for ever
// and never reach the chest phase. That is the failure mode that stalls the whole feature.
for (const map of [1, 4, 7, 12]) {
    const tools = {};
    const got = [];
    for (let i = 0; i < 40; i += 1) {
        const next = nextToolFor(map, tools);
        if (!next) break;
        tools[next.slot] = map;
        got.push(next.slot);
    }
    ok(`map ${map} pays ${TOOL_SLOTS.length} tools then stops`, got.length === TOOL_SLOTS.length,
        `paid ${got.length}`);
    ok(`map ${map} pays each slot exactly once`, new Set(got).size === got.length,
        `${got.length - new Set(got).size} repeat(s)`);
    ok(`map ${map} then asks for a chest`, nextToolFor(map, tools) === null);
}

console.log("\nA TOOL YOU ALREADY BEAT IS NOT OFFERED AGAIN");
// ⚠️ THE RULE IS tier < map, NOT "no tool". Walking back to map one holding tier VII gear must not offer to
// downgrade anything — if this breaks, a deep player farming an early zone slowly destroys their own tools.
const deep = Object.fromEntries(TOOL_SLOTS.map((t) => [t.slot, 7]));
ok("a map-3 bar owes nothing to someone holding tier VII", nextToolFor(3, deep) === null);
ok("a map-7 bar owes nothing either (equal counts as held)", nextToolFor(7, deep) === null);
ok("a map-8 bar still owes the first slot", nextToolFor(8, deep)?.slot === TOOL_SLOTS[0].slot);

console.log("\nTHE CEILING IS LUKE'S PAIRING, CAPPED AT MYTHIC");
// "For zones 1 and 2 then high tier chest would be iron. 3 and 4 gold, etc" — and asked where `etc` stops,
// his call was mythic, because every tier above it is elite-sourced (real money).
const want = { 1: "iron", 2: "iron", 3: "gold", 4: "gold", 5: "mythic", 6: "mythic", 7: "mythic", 12: "mythic" };
for (const [m, tier] of Object.entries(want)) {
    ok(`map ${m} tops out at ${tier}`, barCeiling(Number(m)) === tier, `got ${barCeiling(Number(m))}`);
}
// ⚠️ THE ONE THAT MATTERS MOST. This is the assertion that stops somebody "finishing" the pairing later and
// quietly turning the Grove into a route to paid gear.
const elite = ["ascendant", "eternal", "celestial", "primordial"];
const leaks = [];
for (let m = 1; m <= 12; m += 1) if (elite.includes(barCeiling(m))) leaks.push(m);
ok("NO map can ever pay an elite-sourced chest", leaks.length === 0, `maps ${leaks.join(", ")}`);

console.log("\nA CHEST ROLLS LOW AND SOMETIMES HIGHER, NEVER PAST THE CEILING");
for (const map of [1, 3, 6, 12]) {
    const seen = {};
    let rng = 123456789 + map;
    const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
    for (let i = 0; i < 200000; i += 1) {
        const t = rollBarChest(map, rand);
        seen[t] = (seen[t] || 0) + 1;
    }
    const top = CHEST_ORDER.indexOf(barCeiling(map));
    const over = Object.keys(seen).filter((t) => CHEST_ORDER.indexOf(t) > top);
    ok(`map ${map} never exceeds ${barCeiling(map)}`, over.length === 0, over.join(", "));
    // "a LOW LEVEL chest, with a chance to roll higher" — the floor has to stay the common case, or it is
    // not a low chest that sometimes rolls up, it is a high chest with a bad floor.
    const woodenShare = (seen.wooden || 0) / 200000;
    ok(`map ${map} pays wooden most of the time (${(100 * woodenShare).toFixed(1)}%)`, woodenShare > 0.5);
    const ceilShare = (seen[barCeiling(map)] || 0) / 200000;
    console.log(`       map ${String(map).padStart(2)}  ceiling ${barCeiling(map).padEnd(7)}`
        + `${(100 * ceilShare).toFixed(2)}% of chests  ·  ${Object.keys(seen).length} tiers seen`);
}

console.log("\nDEPTH IS WORTH SOMETHING EVEN THOUGH THE CEILING IS SHARED");
// Maps 5-12 all cap at mythic, so if the promotion odds did not climb, eight maps of progression would be
// worth exactly nothing at the one reward they share. This is the assertion that keeps that honest.
const mythicShare = (map) => {
    let rng = 987654321;
    const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
    let n = 0;
    for (let i = 0; i < 200000; i += 1) if (rollBarChest(map, rand) === "mythic") n += 1;
    return n / 200000;
};
const m5 = mythicShare(5);
const m12 = mythicShare(12);
ok(`map 12 pays mythic more often than map 5 (${(100 * m5).toFixed(2)}% -> ${(100 * m12).toFixed(2)}%)`,
    m12 > m5 * 1.5);

console.log("\nTHE FAUCET, STATED OUT LOUD");
// ⚠️ PRINTED RATHER THAN ASSERTED. BAR_KILLS is a mint rate, not a difficulty dial, and the only way anyone
// will notice it drifting is if the consequence is written where they are already looking.
// 40 kills/min is the Grove's own cap — see [[grove-kill-requirement-is-wall-clock]].
const minsPerFill = BAR_KILLS / 40;
console.log(`       ${BAR_KILLS} kills per fill = ${minsPerFill.toFixed(1)} min floor`);
console.log(`       a full ${TOOL_SLOTS.length}-tool set = ${(minsPerFill * TOOL_SLOTS.length).toFixed(0)} min of farming`);
console.log(`       after that, ${(60 / minsPerFill).toFixed(1)} chests/hour per member, for ever`);
ok("a fill is at least five minutes of real play", minsPerFill >= 5,
    `${minsPerFill.toFixed(1)} min — this is a chest faucet, not a difficulty setting`);

console.log(fails ? `\ncheck:grove-bar — ${fails} FAILED\n` : "\nOK — twelve tools then chests, the ceiling holds at mythic, and depth still buys something.\n");
process.exit(fails ? 1 : 0);
