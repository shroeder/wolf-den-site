// ── WHAT A WIN PAYS ──────────────────────────────────────────────────────────────────────────────────────────
// One rule, and it is the whole file: a multiple of the bet, and ANYTHING THAT PAID AT ALL PAYS AT LEAST ONE
// GOLD. Rounding is not allowed to turn a win into a loss — the line lit, the screen said it paid, and a zero
// underneath that is the machine contradicting itself.
//
// This is what is left of chip-rate.js. That file converted gold into chips at CHIP_RATE, and the floor has
// been one purse since the rework: the rate was 1, the conversion was identity, and all it still did was carry
// the rule above under the name of a currency that no longer exists.
//
// (The rate was 0.25 before that, and 0.08 before that. The step up was about RESOLUTION, not generosity: at
// 0.08 the smallest paying line on The Hunt came to 0.4 and rounded to nothing, so a machine could draw a
// winning line across the screen and pay zero for it. The floor-at-one below is the scar from that.)
export const payoutFor = (bet, multiple) => {
    const raw = bet * multiple;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
};
