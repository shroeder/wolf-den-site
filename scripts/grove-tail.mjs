// ── SIZING "RARE, BUT POSSIBLE" ──────────────────────────────────────────────────────────────────────────────
// Luke, on whether the Grove can drop celestial and primordial gear: "No, its rare, but possible."
//
// So the ladder does NOT stop at eternal — and the only honest way to say "rare" is to pick the number of them
// the Den should see in a month and solve backwards for the roll, rather than guessing a percentage that
// feels small. A 6% step-up "feels rare" and produces thirty celestials a month.
//
// ⚠️ ONE MECHANISM, NOT A SPECIAL CASE PER TIER. Every gear drop rolls its depth's band, then has a small
// chance to step UP one rung and a much smaller chance to step up two. That single dial makes the top tiers
// reachable at the frontier and automatically unreachable in the shallows — two rungs above map 1's common
// band is an epic, which is harmless, while two rungs above map 7's eternal is a primordial. Nothing has to
// know which tier is "the special one".
//
//   node scripts/grove-tail.mjs [celestialPerMonth] [primordialPerMonth]
const KPM = 40;                 // kills/min — the respawn ceiling, not an estimate
const RATE = 0.008;             // steady-state gearChance at depth (§3e)
const DROPS_PER_HOUR = KPM * 60 * RATE;

// The chest ladder's own deliberate Den-wide budget, which is what the Grove is being sized against.
const CHEST_CELESTIAL = 5;
const CHEST_PRIMORDIAL = 1;

const wantC = Number(process.argv[2]) || CHEST_CELESTIAL;
const wantP = Number(process.argv[3]) || CHEST_PRIMORDIAL;

// How much frontier farming the Den plausibly does in a month. 71 members gained an item in the last 30
// days; only the ones at the END of the Grove can roll the top tiers, so this is deliberately a small slice.
const SCENARIOS = [[3, 2], [6, 3], [10, 4], [20, 5]];
const MODEL = SCENARIOS[1];     // 6 farmers, 3 hours a week — the one the rates are solved against
const hoursMonth = MODEL[0] * MODEL[1] * 4.3;
const dropsMonth = hoursMonth * DROPS_PER_HOUR;

const step1 = wantC / dropsMonth;
const step2 = wantP / dropsMonth;

console.log(`${DROPS_PER_HOUR.toFixed(0)} gear drops per hour at the frontier (${(RATE * 100).toFixed(1)}% of ${KPM} kills/min)`);
console.log(`modelled on ${MODEL[0]} farmers x ${MODEL[1]} h/week = ${hoursMonth.toFixed(0)} frontier hours, ${dropsMonth.toFixed(0)} drops a month\n`);
console.log(`to land ${wantC} celestial and ${wantP} primordial a month, Den-wide:`);
console.log(`   step up ONE rung:  ${(step1 * 100).toFixed(2)}%   → 1 per ${(1 / (DROPS_PER_HOUR * step1)).toFixed(0)} hours of farming`);
console.log(`   step up TWO rungs: ${(step2 * 100).toFixed(3)}%  → 1 per ${(1 / (DROPS_PER_HOUR * step2)).toFixed(0)} hours of farming`);

console.log(`\nwhat that produces as the Den's farming grows or shrinks:`);
console.log(`  farmers   h/wk   frontier h/mo   celestial/mo   primordial/mo`);
for (const [n, hrs] of SCENARIOS) {
    const h = n * hrs * 4.3;
    const d = h * DROPS_PER_HOUR;
    console.log(`  ${String(n).padStart(7)} ${String(hrs).padStart(6)} ${h.toFixed(0).padStart(15)} ${(d * step1).toFixed(1).padStart(14)} ${(d * step2).toFixed(2).padStart(15)}`);
}
console.log(`\nchest ladder, for comparison: ${CHEST_CELESTIAL} celestial and ${CHEST_PRIMORDIAL} primordial a month, Den-wide, deliberately.`);
console.log(`ever opened in the Den's history: 18 celestial chests, 9 primordial.`);

// ⚠️ AND THE SHALLOW END IS SAFE FOR FREE, which is the whole reason this is one mechanism rather than a
// per-tier exception: the same roll in map 1 reaches epic, not primordial.
const BANDS = { 1: "common", 2: "rare", 3: "epic", 4: "legendary", 5: "mythic", 6: "ascendant", 7: "eternal" };
const LADDER = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];
console.log(`\nthe same two rolls, by map — no tier needs a special case:`);
for (const [map, band] of Object.entries(BANDS)) {
    const i = LADDER.indexOf(band);
    console.log(`  map ${map}  band ${band.padEnd(11)} one up → ${(LADDER[i + 1] || "—").padEnd(11)} two up → ${LADDER[i + 2] || "—"}`);
}
