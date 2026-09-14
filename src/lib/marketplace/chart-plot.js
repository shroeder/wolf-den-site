// ── OPENING THE CHART, AND WORKING OUT WHERE HE MEANT ────────────────────────────────────────────────────────
// Luke: "I would like the chart you get to be something you open and solve."
//
// So it is a PLOT, not a quiz. The captain gave up three landmarks and how far the place is from each of them.
// Draw a ring round each mark at the distance he named and the island is where the three rings cross. You drag
// a pin to where you think that is, and you push off.
//
// ── ⚠️ THE ONE RULE THIS FILE EXISTS TO OBEY ─────────────────────────────────────────────────────────────────
// A WRONG PLOT STILL LANDS YOU ON THE ISLAND. Always. There is no answer you can give that costs you the thing
// the battle already paid you, and `landfall()` below guarantees it by CONSTRUCTION rather than by a constant
// somebody hoped was big enough: your step budget is measured from where you actually beached to the mark, and
// then slack is added. It cannot be short.
//
// That is the whole lesson of the interrogation minigame, which was solvable, balanced, exhaustively tested and
// deleted anyway — because it sat between a player and a reward they had already earned, and it could fail.
// See [[captains-brig]]. A plot is allowed to be *worth doing well*; it is not allowed to be a wall.
//
// ── WHAT THE STARS DO NOW ────────────────────────────────────────────────────────────────────────────────────
// Luke's original captains idea was "depending on the star rating of the captain helps determine the quality of
// the island you sail to", and that is still exactly true — the grade picks the RUNG, in bands of five, so a
// one-star man names one of the first five islands and a five-star man names one of the last five.
//
// What the grade ALSO does now is decide how legible his chart is. A Certainty draws three hairline rings that
// cross at a point. A Sounding draws three fat smudges and a wide lens of overlap you have to eyeball the
// middle of. A bad chart is not a worse prize, it is worse INFORMATION — which is what a bad chart actually is.
//
// PURE. No database, no server imports: the browser draws the same rings the server scores you against.

import { hash } from "@/lib/marketplace/world-hash.js";
import { ISLANDS, MAX_RUNG, islandByRung, landmarksFor } from "@/lib/marketplace/islands.js";
import { MAX_STARS } from "@/lib/marketplace/captains.js";

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// ── THE CHART FACE ───────────────────────────────────────────────────────────────────────────────────────────
// A unit square. Every coordinate in here is 0..1 so the screen can draw it at any size without a scale factor
// travelling around with it, and so the server scores a tap in the same space the browser took it in.
export const FACE = 1;
/** How much sea the face covers, so a ring radius can be quoted in leagues like a captain would quote it. */
export const LEAGUES_ACROSS = 40;
export const leaguesOf = (r) => Math.max(1, Math.round(r * LEAGUES_ACROSS));

// ── HOW HARD HIS CHART IS TO READ ────────────────────────────────────────────────────────────────────────────
// `slop` is the half-width of a ring band, in face units — the thickness of the pencil he drew it with. `exact`
// is how many of the three soundings he gave in leagues rather than in "about a day's sail"; the rest are drawn
// at HEDGE_MULT the thickness, which is what a hedge looks like on a chart.
//
// ⚠️ THE NUMBERS ARE DELIBERATELY WIDE AT THE BOTTOM. A one-star chart whose rings still crossed at a legible
// point would make the grade cosmetic, and the grade is half of Luke's original idea.
// ⚠️ TUNED AGAINST A MEASURED LENS, NOT BY EYE. The thing a player is actually aiming at is the patch of paper
// where all three ring bands overlap, and scripts/island-sim.mjs measures it by sampling a 40×40 grid. The
// first cut of these numbers made a one-star chart's lens FORTY-FIVE PERCENT of the whole face — which is not
// a hard chart, it is a chart carrying no information at all, and no amount of care could beat a guess on it.
// Re-run section 5 of the sim after touching a single number here: the target is roughly a tenth of the paper
// at one star, down to a point at five.
export const HEDGE_MULT = 2.0;
export const GRADE_READ = {
    1: { slop: 0.080, exact: 0 },
    2: { slop: 0.060, exact: 1 },
    3: { slop: 0.045, exact: 1 },
    4: { slop: 0.030, exact: 2 },
    5: { slop: 0.016, exact: 3 },
};
export const readingFor = (grade) => GRADE_READ[Math.max(1, Math.min(MAX_STARS, Number(grade) || 1))] || GRADE_READ[1];

// How a hedged distance is written when he would not give you a number. Indexed off the ring's own radius so
// the words and the drawn ring never disagree — "a long morning" on a ring three-quarters across the chart
// would be the one piece of the puzzle actively lying to the player.
const HEDGES = [
    { under: 0.22, say: "a short morning's sail" },
    { under: 0.34, say: "half a day, in fair wind" },
    { under: 0.46, say: "the better part of a day" },
    { under: 0.60, say: "a day and a night" },
    { under: 9.99, say: "two days, and he was not certain" },
];
const hedgeFor = (r) => (HEDGES.find((h) => r < h.under) || HEDGES[HEDGES.length - 1]).say;

// ── WHICH ISLAND HE NAMED ────────────────────────────────────────────────────────────────────────────────────
// Five grades, twenty-five islands, five apiece — so the bands line up exactly and a grade is a shelf rather
// than a weighting. Which of the five within the band is the seed's business, so two Certainties taken off two
// different captains are two different places.
export const RUNGS_PER_GRADE = Math.round(MAX_RUNG / MAX_STARS);
export function islandForChart(seed, grade) {
    const g = Math.max(1, Math.min(MAX_STARS, Number(grade) || 1));
    const lo = (g - 1) * RUNGS_PER_GRADE + 1;
    const pick = Math.floor(hash(Math.floor(Number(seed) || 0) ^ 0x1a5e, 0) * RUNGS_PER_GRADE);
    return islandByRung(Math.min(MAX_RUNG, lo + Math.min(RUNGS_PER_GRADE - 1, pick)));
}

// ── THE CHART ITSELF ─────────────────────────────────────────────────────────────────────────────────────────
// Everything on the face, derived from the seed and the grade alone. The same chart opened twice is the same
// chart — which matters because a plot you can re-open after a reload must not be a different puzzle.
//
// The fix is kept well inside the face so that every ring fits on the paper; the three marks are pushed out to
// the rim and spread around it, because three landmarks clustered in one corner give three nearly-parallel
// rings and no crossing worth looking at. That is a real surveying failure — a bad cut — and reproducing it
// would be authentic and unplayable.
export const FIX_INSET = 0.26;       // the fix never sits within this of an edge
export const MARK_RING = 0.40;       // how far out from centre the landmarks are thrown
export const MIN_ARM = 0.17;         // and no landmark may sit closer than this to the fix

export function chartFace(seed, grade) {
    const s = Math.floor(Number(seed) || 0);
    const read = readingFor(grade);
    const island = islandForChart(s, grade);
    const marks = landmarksFor(island);

    // The mark itself, somewhere in the middle band of the paper.
    const fix = {
        x: FIX_INSET + hash(s ^ 0x5f1a, 1) * (1 - FIX_INSET * 2),
        y: FIX_INSET + hash(s ^ 0x5f1a, 2) * (1 - FIX_INSET * 2),
    };

    // Three landmarks, thrown around a circle at evenly-spaced thirds with a wobble, so the cut is always
    // decent but never mechanical. A landmark that lands too near the fix is pushed back out along its own
    // bearing rather than re-rolled — re-rolling is where a generator goes into a loop it cannot leave.
    const soundings = [0, 1, 2].map((k) => {
        const wobble = (hash(s ^ 0x2b7d, k) - 0.5) * 0.7;                 // ±0.35 rad
        const theta = (k / 3) * Math.PI * 2 + wobble + hash(s ^ 0x91c4, 0) * Math.PI * 2;
        const reach = MARK_RING * (0.75 + hash(s ^ 0x44e1, k) * 0.5);
        let x = 0.5 + Math.cos(theta) * reach;
        let y = 0.5 + Math.sin(theta) * reach;
        // Keep it on the paper with a margin for the pin glyph.
        x = Math.max(0.06, Math.min(0.94, x));
        y = Math.max(0.06, Math.min(0.94, y));
        let r = Math.hypot(x - fix.x, y - fix.y);
        if (r < MIN_ARM) {
            // Too close to say anything useful. Walk it away from the fix along the line it already sits on.
            const ux = (x - fix.x) / (r || 1), uy = (y - fix.y) / (r || 1);
            x = Math.max(0.06, Math.min(0.94, fix.x + ux * MIN_ARM));
            y = Math.max(0.06, Math.min(0.94, fix.y + uy * MIN_ARM));
            r = Math.hypot(x - fix.x, y - fix.y);
        }
        // The first `exact` soundings are the ones he gave a number for. The rest are drawn fat and hedged.
        const exact = k < read.exact;
        return {
            k, mark: marks[k], x, y, r,
            slop: exact ? read.slop : read.slop * HEDGE_MULT,
            exact,
            says: exact ? `${leaguesOf(r)} leagues` : hedgeFor(r),
        };
    });

    return { seed: s, grade: Math.max(1, Math.min(MAX_STARS, Number(grade) || 1)), island: island.id, fix, soundings, read };
}

// ── SCORING THE PLOT ─────────────────────────────────────────────────────────────────────────────────────────
// One number, 0..1, off the distance between the pin and the truth. It is deliberately NOT graded against the
// chart's own slop: a player who reads three fat smudges carefully and gets it right has genuinely got it
// right, and scaling their success away because the paper was poor would punish the skill the puzzle is for.
// The grade already had its say — it chose the island.
export const MISS_FULL = 0.46;       // a pin this far out scores zero, and still sails
export const plotAccuracy = (face, at) =>
    clamp01(1 - Math.hypot((at?.x ?? 0) - face.fix.x, (at?.y ?? 0) - face.fix.y) / MISS_FULL);

// What to call it on screen once it is plotted. Words, not a percentage — "you were 0.31 out" is a mark out of
// ten for a thing that should feel like seamanship.
export const PLOT_BANDS = [
    { min: 0.92, id: "dead", name: "Dead on the mark", say: "The three rings cross under your pin." },
    { min: 0.74, id: "close", name: "A good cut", say: "Close enough that the lookout will see it before dark." },
    { min: 0.48, id: "fair", name: "A fair reckoning", say: "You will find it. You will do some coasting first." },
    { min: 0.22, id: "loose", name: "Loose", say: "Somewhere along that shore. You will know it when you see it." },
    { min: 0, id: "wild", name: "A wild guess", say: "You will make landfall. It will be the wrong end of it." },
];
export const plotBand = (acc) => PLOT_BANDS.find((b) => acc >= b.min) || PLOT_BANDS[PLOT_BANDS.length - 1];

// ── WHERE YOU BEACH, AND HOW LONG THE TIDE GIVES YOU ─────────────────────────────────────────────────────────
// The island is a strip of `span` nodes. The mark is at `fixIndex`, fixed by the seed. Where you land is the
// only thing your plot decides: dead on the mark and you anchor off it, a wild guess and you come ashore at
// whichever end is furthest from it.
//
// ⚠️ AND THE TIDE IS MEASURED, NEVER GUESSED. `tide` starts as the exact number of steps from where you beached
// to the mark, and slack is added on top. So the worst plot in the game still walks to its prize with ten steps
// to spare, and nothing about this can drift when someone widens an island later. Everything accuracy buys is
// SLACK — steps left over to search the rest of the island with — which is a real reward for reading the chart
// well that never takes the earned thing away from anyone who read it badly.
export const TIDE_SLACK_MIN = 10;    // spare steps even on a wild guess
export const TIDE_SLACK_BONUS = 34;  // and up to this many more for a dead-on plot

export function landfall(face, accuracy, span) {
    const acc = clamp01(accuracy);
    const n = Math.max(8, Math.floor(Number(span) || 32));
    // The mark, kept off both ends so there is always island on either side of it to walk.
    const fixIndex = Math.round(n * (0.28 + hash(face.seed ^ 0x7a1d, 3) * 0.44));
    // The far end is whichever shore the mark is NOT near; a wild guess puts you there.
    const farEnd = fixIndex < n / 2 ? n - 1 : 0;
    const entry = Math.round(fixIndex * acc + farEnd * (1 - acc));
    const walk = Math.abs(entry - fixIndex);
    return {
        fixIndex, entry, span: n,
        // Measured off the real walk. Cannot be short. See the note above.
        tide: walk + TIDE_SLACK_MIN + Math.round(acc * TIDE_SLACK_BONUS),
        walk,
    };
}

/** The whole solved chart, ready to hand to a screen or to store on an expedition row. */
export function solveChart({ seed, grade, at }) {
    const face = chartFace(seed, grade);
    const island = ISLANDS.find((i) => i.id === face.island) || ISLANDS[0];
    const accuracy = plotAccuracy(face, at || face.fix);
    return { face, island: island.id, accuracy, band: plotBand(accuracy), ...landfall(face, accuracy, island.span) };
}
