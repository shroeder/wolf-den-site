// Actively-traded trading card game categories synced from tcgcsv into tcg_sets / tcg_cards.
// Deliberately conservative: the dead/obscure card games tcgcsv carries (Redakai, WoW TCG, Neopets,
// Transformers, etc.) and all non-card categories (supplies, Funko, miniatures, comics) are left out.
// `categoryId` = tcgcsv (TCGplayer) category id; `slug` = the value stored in the `game` column;
// `label` = what the UI shows. SINGLE source of truth — the daily catalog-sync job selects categories
// from here and the game filters render labels from here. Ordered roughly by activity (drives the
// filter dropdown order). Keep `pokemon` (3) / `magic` (1) slugs as-is so existing rows stay
// consistent. Add/remove a row to change coverage (ids: https://tcgcsv.com/tcgplayer/categories).

export const TCG_GAMES = [
    { categoryId: 1, slug: "magic", label: "Magic: The Gathering" },
    { categoryId: 3, slug: "pokemon", label: "Pokémon" },
    { categoryId: 85, slug: "pokemon-japan", label: "Pokémon Japan" },
    { categoryId: 2, slug: "yugioh", label: "Yu-Gi-Oh!" },
    { categoryId: 71, slug: "lorcana", label: "Disney Lorcana" },
    { categoryId: 68, slug: "one-piece", label: "One Piece Card Game" },
    { categoryId: 62, slug: "flesh-and-blood", label: "Flesh and Blood" },
    { categoryId: 63, slug: "digimon", label: "Digimon Card Game" },
    { categoryId: 79, slug: "star-wars-unlimited", label: "Star Wars: Unlimited" },
    { categoryId: 80, slug: "dragon-ball-fusion", label: "Dragon Ball Super: Fusion World" },
    { categoryId: 86, slug: "gundam", label: "Gundam Card Game" },
    { categoryId: 81, slug: "union-arena", label: "Union Arena" },
    { categoryId: 89, slug: "riftbound", label: "Riftbound: League of Legends" },
    { categoryId: 87, slug: "hololive", label: "hololive OFFICIAL CARD GAME" },
    { categoryId: 24, slug: "final-fantasy", label: "Final Fantasy TCG" },
    { categoryId: 77, slug: "sorcery", label: "Sorcery: Contested Realm" },
    { categoryId: 74, slug: "grand-archive", label: "Grand Archive" },
    { categoryId: 20, slug: "weiss-schwarz", label: "Weiss Schwarz" },
    { categoryId: 16, slug: "cardfight-vanguard", label: "Cardfight!! Vanguard" },
    { categoryId: 88, slug: "godzilla", label: "Godzilla Card Game" },
    { categoryId: 90, slug: "cookierun", label: "CookieRun: Braverse" },
    { categoryId: 83, slug: "elestrals", label: "Elestrals" },
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
