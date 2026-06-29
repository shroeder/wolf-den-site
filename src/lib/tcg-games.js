// Curated list of trading card games synced from tcgcsv into tcg_sets / tcg_cards.
// `categoryId` is the tcgcsv (TCGplayer) category id; `slug` is the value stored in the
// `game` column; `label` is what the UI shows. This is the SINGLE source of truth — the daily
// catalog-sync job selects categories from here, and the game filters render labels from here.
//
// To widen or narrow coverage, just add/remove a row (find category ids at
// https://tcgcsv.com/tcgplayer/categories). Keep `pokemon` (3) and `magic` (1) slugs as-is so
// existing rows stay consistent.

export const TCG_GAMES = [
    { categoryId: 1, slug: "magic", label: "Magic: The Gathering" },
    { categoryId: 3, slug: "pokemon", label: "Pokémon" },
    { categoryId: 2, slug: "yugioh", label: "Yu-Gi-Oh!" },
    { categoryId: 71, slug: "lorcana", label: "Disney Lorcana" },
    { categoryId: 68, slug: "one-piece", label: "One Piece" },
    { categoryId: 62, slug: "flesh-and-blood", label: "Flesh and Blood" },
    { categoryId: 63, slug: "digimon", label: "Digimon" },
    { categoryId: 79, slug: "star-wars-unlimited", label: "Star Wars: Unlimited" },
    { categoryId: 80, slug: "dragon-ball-fusion", label: "Dragon Ball Super: Fusion World" },
    { categoryId: 86, slug: "gundam", label: "Gundam" },
    { categoryId: 81, slug: "union-arena", label: "Union Arena" },
    { categoryId: 89, slug: "riftbound", label: "Riftbound: League of Legends" },
];

const BY_CATEGORY = new Map(TCG_GAMES.map((g) => [g.categoryId, g]));
const BY_SLUG = new Map(TCG_GAMES.map((g) => [g.slug, g]));

// Registry entry for a tcgcsv category id, or null if it's not one we sync.
export function gameForCategoryId(categoryId) {
    return BY_CATEGORY.get(Number(categoryId)) || null;
}

export function gameLabel(slug) {
    return BY_SLUG.get(slug)?.label || slug;
}

export function isKnownGame(slug) {
    return BY_SLUG.has(slug);
}

export const GAME_SLUGS = TCG_GAMES.map((g) => g.slug);
