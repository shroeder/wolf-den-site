// ── THE RARITY LADDER, ONCE ──────────────────────────────────────────────────────────────────────────────────
// Pure and client-safe. This exists because the same seven-entry map —
//
//     { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 }
//
// was copy-pasted into a dozen files: inventory sorting, signature magnitudes, the arena's kit reader, boss
// reward gating, chest promotion, reforge pricing, trade valuation, the raid drop table, the play landing, the
// daily deals and the arena audio. Twelve copies of one fact.
//
// That was survivable while the ladder never moved. It stopped being survivable the moment two tiers were
// added above eternal: a celestial item would sort as `undefined`, never promote out of a chest, and reforge
// at the fallback price — and every one of those failures is silent. Nothing throws when a rarity is missing
// from a lookup table; it just quietly ranks below common.
//
// So: one ladder, one rank function, and the tiers a piece of gear can actually be.
export const RARITIES = [
    "common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial",
];

/** rarity → its position on the ladder. Unknown reads as -1, which sorts below common rather than beside it. */
export const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

export const rarityRank = (r) => (RARITY_RANK[String(r || "")] ?? -1);

/** Compare two rarities, ascending. */
export const byRarity = (a, b) => rarityRank(a) - rarityRank(b);

/** The next rarity up, or the same one at the top of the ladder. Used by chest promotion. */
export const nextRarity = (r) => RARITIES[Math.min(RARITIES.length - 1, rarityRank(r) + 1)] || r;

// The top four are bound to their owner (see TRADE_LOCKED_RARITIES in items.js, which this mirrors rather than
// replaces — items.js owns the trade rule, this owns the ladder).
export const TOP_TIERS = ["ascendant", "eternal", "celestial", "primordial"];

// Display, for anything that needs to colour a name without importing a component's private table.
export const RARITY_META = {
    common: { label: "Common", color: "#9aa0a6" },
    rare: { label: "Rare", color: "#4aa3d4" },
    epic: { label: "Epic", color: "#a855f7" },
    legendary: { label: "Legendary", color: "#f0a83c" },
    mythic: { label: "Mythic", color: "#ff5cc8" },
    ascendant: { label: "Ascendant", color: "#ff7a3c" },
    eternal: { label: "Eternal", color: "#37f5c0" },
    celestial: { label: "Celestial", color: "#7c5cff" },
    primordial: { label: "Primordial", color: "#ffe9b0" },
};
