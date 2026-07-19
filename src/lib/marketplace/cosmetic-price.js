// Pure (client-safe) gold price to buy a locked cosmetic early. A steep power curve so the ladder runs
// from ~500 gold (low level) all the way to ~400k+ for endgame prestige cosmetics — a true super-high-end
// gold sink, in line with the top gear. Kept out of the server-only store module so the pickers can show
// prices too. Tune the exponent / per-category multiplier here and it updates everywhere.
const CAT_MULT = { pet: 55, border: 65, frame: 58, cosmetic: 70, background: 75 };
const CURVE = 1.9; // super-linear: high-level cosmetics cost disproportionately more

export function cosmeticPrice(category, level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    const raw = Math.pow(lvl, CURVE) * (CAT_MULT[category] || 55);
    return Math.max(300, Math.round(raw / 100) * 100);
}
