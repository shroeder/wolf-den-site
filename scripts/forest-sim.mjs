// ── HOW LONG IS A TREE, AND IS MASHING WORTH IT ──────────────────────────────────────────────────────
// A tap-as-fast-as-you-can game is only a game if going fast is measurably better. This drives real tap
// cadences through the real swing() and reports seconds-to-fell and wood-per-minute.
//   node scripts/forest-sim.mjs
import { TREES, TREE_IDS, plant, swing, woodFor, biteFor, axeForm, axeTotal, AXE_TRACKS, trackCost, regrow, PATCHES }
    from "@/lib/marketplace/forest.js";

// Real thumb speeds, measured in ms between taps.
const CADENCE = { mash: 110, quick: 190, steady: 320, slow: 520 };

function fell(treeId, axe, gap) {
    let p = plant(treeId), t = 0, last = 0, streak = 0, taps = 0, doubles = 0;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    while (!p.felled && taps < 4000) {
        t += gap; taps += 1;
        const r = swing(p, axe, { now: t, last, streak, roll: rnd() });
        p = r.patch; streak = r.streak; last = t; if (r.doubled) doubles += 1;
    }
    return { secs: t / 1000, taps, doubles };
}

for (const [axeName, axe] of [["bare axe", {}], ["mid", { edge: 6, haft: 4, heft: 4 }], ["maxed", { edge: 12, haft: 8, heft: 8 }]]) {
    const form = axeForm(axeTotal(axe));
    console.log(`\n${axeName}  (edge ${axe.edge || 0} haft ${axe.haft || 0} heft ${axe.heft || 0}) — bite ${biteFor(axe.edge)}, ${form.name}`);
    console.log("  tree        " + Object.keys(CADENCE).map((c) => c.padStart(9)).join("") + "     wood");
    for (const id of TREE_IDS) {
        const row = Object.values(CADENCE).map((gap) => fell(id, axe, gap).secs.toFixed(1) + "s");
        console.log(`  ${TREES[id].name.padEnd(11)} ` + row.map((r) => r.padStart(9)).join("") + `   ${String(woodFor(id)).padStart(6)}`);
    }
}

// Is mashing worth it?
const mid = { edge: 6, haft: 4, heft: 4 };
const a = fell("oak", mid, CADENCE.mash), b = fell("oak", mid, CADENCE.slow);
console.log(`\nan oak: mashing ${a.secs.toFixed(1)}s in ${a.taps} taps · pacing ${b.secs.toFixed(1)}s in ${b.taps} taps`
    + `  -> mashing is ${(b.secs / a.secs).toFixed(1)}x faster and costs ${(a.taps / b.taps).toFixed(2)}x the taps`);

// What a full stand pays, and how long it is bare.
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let wood = 0, bare = 0;
for (let i = 0; i < PATCHES; i += 1) { const id = regrow(rnd(), 1); wood += woodFor(id); bare += TREES[id].regrow; }
console.log(`a full stand of ${PATCHES}: ~${wood} wood, average regrow ${(bare / PATCHES).toFixed(0)} min`);
// ⚠️ ASKS trackCost RATHER THAN PRINTING 30. This line said "edge 30 haft 30 heft 30" for a while after the
// tracks were priced apart, which is the worst thing a simulator can do: report a number the game does not
// charge. See [[reuse-the-rule-never-restate-it]].
const lvl1 = Object.keys(AXE_TRACKS).map((k) => `${k} ${trackCost(k, 0)}`).join("  ");
console.log(`first upgrade of each track costs: ${lvl1} wood`);
console.log(`maxing every track costs: ${Object.keys(AXE_TRACKS).reduce((n, k) =>
    n + Array.from({ length: AXE_TRACKS[k].max }, (_, l) => trackCost(k, l)).reduce((a, b) => a + b, 0), 0)} wood`);
