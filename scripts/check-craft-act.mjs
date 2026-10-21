// ── THE BOARD IS THE ROLL, SO IT HAS TO BE AN HONEST ONE ─────────────────────────────────────────────────────
// The craft act is a plinko board whose buckets are the five quality bands, and where the ball stops IS the
// craft. The claim the whole screen rests on is that a band width equals its chance — otherwise it is a slot
// machine wearing a diagram, and the player is shown one set of odds and rolled against another. That is
// exactly the defect found in qualityOdds the day before, so it gets a gate rather than a comment.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-craft-act.mjs
//
//   1  the floor is whole — the spans tile 0..1 with no gap and no overlap, at every level
//   2  a band width IS its share, exactly, at every level, act and temper state
//   3  the board tracks the designed curve, and a better act widens the good bands AT EVERY LEVEL
//      (two earlier versions of this file failed here: one gave three levels the same board, the other
//       stopped responding to the act at level 10 and above)
//   4  the rattle always ends exactly on the landing — the animation can never contradict the grant
//   5  the landing is uniform, so width really is chance
//   6  a quality score always reads back as the band it was drawn for
import {
    boardFor, boardOdds, dropAt, bandAt, rattle, qualityInBand,
    actBias, actScore, strikeGrade, heatScore, PEG_ROWS,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, qualityOdds, qualityBand } from "@/lib/marketplace/grove-forge.js";

let bad = 0;
const fail = (msg) => { console.error("  FAIL  " + msg); bad += 1; };
const GOOD = new Set(["masterwork", "pristine", "fine"]);
const ACTS = [
    { name: "none   ", act: { heat: 0, strikes: [0, 0, 0] } },
    { name: "decent ", act: { heat: 0.7, strikes: [0.55, 0.55, 1] } },
    { name: "perfect", act: { heat: 1, strikes: [1, 1, 1] } },
];
const LEVELS = [1, 2, 4, 8, 12, 18, 25];

// ── 1 + 2 + 3 ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("the floor, against the curve it is built from");
console.log("  lvl  act        " + QUALITY_BANDS.map((b) => b.name.padStart(11)).join(""));
let worstDesign = 0;
let worstExact = 0;
for (const lv of LEVELS) {
    for (const { name, act } of ACTS) {
        for (const temper of [false, true]) {
            const spans = boardFor(lv, { temper, act });

            // 1: the spans tile the bar
            let cursor = 0;
            for (const s of spans) {
                if (Math.abs(s.from - cursor) > 1e-12) fail(`level ${lv}: a gap or overlap at ${s.from} (expected ${cursor})`);
                if (s.to < s.from) fail(`level ${lv}: span ${s.id} runs backwards`);
                cursor = s.to;
            }
            if (Math.abs(cursor - 1) > 1e-12) fail(`level ${lv}: the floor ends at ${cursor}, not 1 — a ball could land in nothing`);

            // 2: width is share, exactly
            const played = Object.fromEntries(boardOdds(spans).map((o) => [o.id, o.share]));
            const design = Object.fromEntries(qualityOdds(lv, temper, actBias(act)).map((o) => [o.id, o.share]));
            for (const b of QUALITY_BANDS) {
                worstExact = Math.max(worstExact, Math.abs((played[b.id] || 0) - (design[b.id] || 0)));
                worstDesign = Math.max(worstDesign, Math.abs((played[b.id] || 0) - (design[b.id] || 0)));
            }
            if (!temper && lv === 4) {
                console.log(`  ${String(lv).padStart(3)}  ${name}  `
                    + QUALITY_BANDS.map((b) => `${((played[b.id] || 0) * 100).toFixed(2)}%`.padStart(11)).join(""));
            }
        }
    }
}
// ⚠️ EXACT, NOT APPROXIMATE. The spans are cut straight from the curve, so anything above floating-point
// noise means the board and the odds have come apart — which is the one thing this file exists to prevent.
if (worstExact > 1e-9) fail(`a band width is ${(worstExact * 100).toFixed(4)}pp from its share — the board is not the odds`);
console.log(`  worst width-vs-share error across ${LEVELS.length * 6} boards: ${(worstExact * 100).toExponential(2)}pp`);

console.log("\nthe act widens the good bands, at every level — including the cap:");
for (const lv of LEVELS) {
    const share = (act) => boardOdds(boardFor(lv, { act }))
        .filter((o) => GOOD.has(o.id)).reduce((a, o) => a + o.share, 0);
    const none = share(ACTS[0].act);
    const mid = share(ACTS[1].act);
    const best = share(ACTS[2].act);
    if (!(best > none + 1e-6)) fail(`level ${lv}: a perfect act does not widen the good bands (${none} -> ${best})`);
    if (!(mid > none + 1e-6)) fail(`level ${lv}: a decent act does not widen the good bands`);
    if (mid > best + 1e-9) fail(`level ${lv}: a decent act beats a perfect one`);
    console.log(`  lvl ${String(lv).padStart(2)}   Fine+   none ${(none * 100).toFixed(1)}%   decent ${(mid * 100).toFixed(1)}%   perfect ${(best * 100).toFixed(1)}%`);
}

// ── 4: THE FALL CANNOT CONTRADICT THE GRANT ─────────────────────────────────────────────────────────────────
let rattled = 0;
for (let seed = 1; seed <= 4000; seed += 1) {
    const at = dropAt(seed);
    const path = rattle(at, seed);
    if (path.length !== PEG_ROWS) fail(`rattle seed ${seed}: ${path.length} rows, expected ${PEG_ROWS}`);
    if (Math.abs(path[path.length - 1] - at) > 1e-12) fail(`rattle seed ${seed} ends at ${path[path.length - 1]}, landing is ${at}`);
    if (path.some((x) => x < 0 || x > 1)) fail(`rattle seed ${seed} leaves the board`);
    rattled += 1;
}
console.log(`\n${rattled.toLocaleString()} falls drawn, every one ending exactly on its landing and inside the board.`);

// ── 5: THE LANDING IS UNIFORM, SO WIDTH IS CHANCE ───────────────────────────────────────────────────────────
const N = 300000;
const spans4 = boardFor(4, {});
const hit = {};
const bins = new Array(20).fill(0);
for (let s = 1; s <= N; s += 1) {
    const at = dropAt(s);
    bins[Math.min(19, Math.floor(at * 20))] += 1;
    const b = bandAt(spans4, at);
    hit[b] = (hit[b] || 0) + 1;
}
let drift = 0;
for (const n of bins) drift = Math.max(drift, Math.abs(n / N - 1 / 20));
if (drift > 0.004) fail(`dropAt is not uniform — worst twentieth is ${(drift * 100).toFixed(2)}pp off`);
console.log(`${N.toLocaleString()} balls dropped, worst twentieth ${(drift * 100).toFixed(3)}pp from uniform.`);
for (const o of boardOdds(spans4)) {
    const got = (hit[o.id] || 0) / N;
    if (Math.abs(got - o.share) > 0.005) {
        fail(`${o.name} landed ${(got * 100).toFixed(2)}% against a width of ${(o.share * 100).toFixed(2)}%`);
    }
}
console.log("  and every band was hit at its own width, within sampling noise.");

// ── 6 + THE BEATS ───────────────────────────────────────────────────────────────────────────────────────────
for (const b of QUALITY_BANDS) {
    for (let seed = 1; seed <= 500; seed += 1) {
        const q = qualityInBand(b.id, seed);
        if (qualityBand(q).id !== b.id) fail(`qualityInBand gave ${q} for ${b.name}, which reads back as ${qualityBand(q).id}`);
    }
}
if (heatScore(0) !== 0) fail("no taps should score zero heat");
if (heatScore(9999) !== 1) fail("heat is not capped at 1 — over-tapping must not pay");
if (strikeGrade(0).id !== "perfect") fail("dead centre is not a perfect strike");
if (strikeGrade(1).id !== "miss") fail("the end of the bar is not a miss");
if (strikeGrade(-0.02).id !== "perfect") fail("the perfect window is not symmetric — early must score like late");
if (actScore({ heat: 1, strikes: [1, 1, 1] }) !== 1) fail("a flawless act does not score 1");
if (actScore({ heat: 9, strikes: [9, 9, 9] }) !== 1) fail("act score is not clamped — a lying client would be paid");
if (actBias({ heat: 0, strikes: [0, 0, 0] }) !== 0) fail("a fumbled act is not worth zero");

console.log(bad
    ? `\ncheck:craft-act — ${bad} problem(s).`
    : "\ncheck:craft-act — a band is exactly as wide as its chance, the fall always ends where it was sent, "
      + "and a thumb is worth less than the ladder.");
process.exit(bad ? 1 : 0);
