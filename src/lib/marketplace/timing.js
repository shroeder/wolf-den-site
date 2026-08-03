// ── TIMING BANDS ─────────────────────────────────────────────────────────────────────────────────────────────
// The one place the timing-bar cut-points live. The forge, the kitchen, the mine and the town boss all run the
// same bar, and they used to each carry their own copy of these four numbers — six copies in all, counting the
// two servers. Widening PERFECT meant six edits and missing one meant a feature that quietly played by
// different rules than the rest of the game.
//
// What is shared is the DIFFICULTY: how close to centre counts as a PERFECT. What is deliberately NOT shared is
// everything a feature uses to give that grade meaning — its labels, its payout multipliers, its cooldowns, its
// palette. A pixel-perfect strike is the same act of skill everywhere; what it's worth is the feature's call.
//
// `dist` is always distance from the centre of the bar, 0 (dead centre) to 0.5 (either end).

export const BAND_MAX = {
    pixel: 0.022,
    perfect: 0.055,
    great: 0.10,
    good: 0.16,
};

// Tightest first — the order every lookup walks, so the first band a distance fits is the best one it earned.
export const GRADE_KEYS = ["pixel", "perfect", "great", "good"];

// For comparing grades: was this swing better than the last one?
export const GRADE_RANK = { miss: 0, good: 1, great: 2, perfect: 3, pixel: 4 };

// The house palette. Cooking overrides it (its bar is pink-on-warm to match the kitchen); everything else
// shares these, so a blue flash means PERFECT wherever you see it.
export const GRADE_COLOR = {
    pixel: "#ffd75e",
    perfect: "#8fe3ff",
    great: "#8fe39a",
    good: "#d7c48a",
    miss: "#ff8f9a",
};

// The grade for a distance. `widen` is the forge's steady-hand style allowance — it loosens every band by the
// same amount rather than promoting one, so a perk makes you better at the game without changing what the
// grades mean.
export function gradeKeyForDist(dist, widen = 0) {
    const d = Math.max(0, Number(dist) || 0);
    return GRADE_KEYS.find((k) => d <= BAND_MAX[k] + widen) || "miss";
}

// Build a feature's grade table off the shared cut-points. Pass the parts that are yours — label, mult, score,
// colour — keyed by grade, and the widths come from here:
//
//   const SWING_GRADES = bandTable({ pixel: { mult: 5.0, label: "PERFECT STRIKE" }, … });
//
// Returns tightest-first, so `.find(g => dist <= g.max)` still works exactly as the hand-written arrays did.
export function bandTable(byKey) {
    return GRADE_KEYS.map((key) => ({ key, max: BAND_MAX[key], color: GRADE_COLOR[key], ...(byKey[key] || {}) }));
}

// ── RENDERING ────────────────────────────────────────────────────────────────────────────────────────────────
// A band of ±0.022 is 4.4% of the bar's width. Drawn at true size the PIXEL zone is a hairline nobody can aim
// at, so every bar in the game renders the zones at DOUBLE width and lets the sub-pixel accuracy be the real
// test. Kept here with the cut-points, because the day these two drift apart is the day the bar starts lying
// about where the good hit is.
export const ZONE_SCALE = 2;
// Rounded, because these land in CSS: 0.055 * 200 is 11.000000000000002 in floating point, and a stylesheet
// full of that is noise in every inspector.
export const bandPct = (key) => Math.round(BAND_MAX[key] * 100 * ZONE_SCALE * 1000) / 1000;
export const bandLeftPct = (key) => Math.round((50 - bandPct(key) / 2) * 1000) / 1000;
