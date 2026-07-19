// Pure (client-safe) gold price to buy a locked cosmetic early. Higher-level unlocks cost more — the price
// ladder runs from a few thousand (low-level) to ~100k+ (endgame prestige). Kept out of the server-only
// store module so the pickers can compute + show prices too.
const PRICE_MULT = { pet: 800, border: 1000, frame: 900, cosmetic: 1200 };

export function cosmeticPrice(category, level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(500, Math.round((lvl * (PRICE_MULT[category] || 800)) / 100) * 100);
}
