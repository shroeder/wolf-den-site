// ── THE LEVEL CURVE — ONE COPY, FOR EVERYONE ─────────────────────────────────────────────────────────────────
// This lives in its own PURE module (no DB, no server-only) on purpose. It used to sit inside xp.js, which is
// server-only and imports unlocks.js — so unlocks.js could not import it back without a cycle, and every other
// caller that needed "how much XP is level L" just re-typed the closed form `50*(L-1)*L` instead.
//
// That was fine right up until the curve was steepened above level 20, at which point the copies were quietly
// describing a DIFFERENT game. The HUD nudge computed the level from this table but the XP-to-next from the
// old formula, so a level-28 member with 51,800 XP was measured against the old level-29 floor of 40,600 —
// already past it — and the strip rendered a full bar reading "0 XP →" that never advanced. Nothing was wrong
// with the account; three files simply disagreed about what level 29 costs.
//
// So: anything that needs the curve imports it from HERE. No closed forms in callers, ever. A `50 * (L - 1) * L`
// appearing anywhere in the repo again is a bug in waiting.
//
// Up to level 20 the curve is the original quadratic: cumulative XP to REACH level L is 50*(L-1)*L
// → L2=100, L5=1,000, L20=19,000.
//
// Above 20 it STEEPENS. The old curve was a plain quadratic all the way up, so each level cost only 100*L more
// than the last and the back half of the ladder was a formality — level 100 was 495,000 XP, which at the rate
// the Den actually earns is not a decade-long goal, it is a few months of showing up. A ladder everyone tops
// out on stops being a ladder.
//
// The step cost now carries a multiplier that grows 20% per level past 20, capped at 8x so it stays a climb
// rather than a wall:
//
//   L30   43,500 ->    67,200   (1.5x)
//   L50  122,500 ->   467,600   (3.8x)
//   L100 495,000 -> 3,432,200   (6.9x)
//
// TWENTY is chosen so this demotes NOBODY: the whole Den sits at or below it apart from two members at 21 and
// the owner, and the multiplier starts at exactly 1.0 so reaching 21 costs what it always did. Retroactively
// taking levels off people to fix a curve is not a trade worth making.
const CURVE_KNEE = 20;
const CURVE_GROWTH = 0.2;
const CURVE_CAP = 8;
export const MAX_LEVEL = 200;

// Cumulative XP required to REACH each level, built once. A table rather than a closed form because the
// multiplier is capped, and a piecewise-capped sum has no tidy inverse worth the trouble.
const LEVEL_FLOOR = (() => {
    const out = [0, 0]; // index = level; L1 needs 0
    let cum = 0;
    for (let L = 1; L < MAX_LEVEL; L += 1) {
        const step = L < CURVE_KNEE
            ? 100 * L
            : 100 * L * Math.min(CURVE_CAP, 1 + (L - CURVE_KNEE) * CURVE_GROWTH);
        cum += step;
        out[L + 1] = Math.round(cum);
    }
    return out;
})();

/** Cumulative XP needed to reach a level (clamped to the table). */
export const xpForLevel = (level) => LEVEL_FLOOR[Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))] ?? 0;

// Returns level + progress toward the next.
export function levelForXp(totalXp) {
    const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
    let level = 1;
    // Walk up while the NEXT level is affordable. At most 200 steps, and levels are read constantly, so this
    // stays a tight loop over a preallocated array rather than anything clever.
    while (level < MAX_LEVEL && xp >= LEVEL_FLOOR[level + 1]) level += 1;
    const floorXp = LEVEL_FLOOR[level];
    const nextXp = level >= MAX_LEVEL ? floorXp : LEVEL_FLOOR[level + 1];
    const span = nextXp - floorXp;
    const into = xp - floorXp;
    return {
        level,
        totalXp: xp,
        currentLevelXp: into,
        nextLevelXp: span,
        xpToNext: Math.max(0, nextXp - xp),
        progress: span > 0 ? Math.min(1, into / span) : 0,
    };
}
