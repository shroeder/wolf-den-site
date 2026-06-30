// Every trading-card-game category synced from tcgcsv into tcg_sets / tcg_cards (the non-card
// tcgcsv categories — supplies, Funko, miniatures, Warhammer, comics, accessories — are excluded).
// `categoryId` is the tcgcsv (TCGplayer) category id; `slug` is the value stored in the `game`
// column; `label` is what the UI shows. SINGLE source of truth — the daily catalog-sync job selects
// categories from here, and the game filters render labels from here. Ordered roughly by activity
// (drives the filter dropdown order). Keep `pokemon` (3) / `magic` (1) slugs as-is so existing rows
// stay consistent. Add/remove a row to change coverage (ids: https://tcgcsv.com/tcgplayer/categories).

export const TCG_GAMES = [
    { categoryId: 1, slug: "magic", label: "Magic: The Gathering" },
    { categoryId: 3, slug: "pokemon", label: "Pokémon" },
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
    { categoryId: 85, slug: "pokemon-japan", label: "Pokémon Japan" },
    { categoryId: 87, slug: "hololive", label: "hololive OFFICIAL CARD GAME" },
    { categoryId: 24, slug: "final-fantasy", label: "Final Fantasy TCG" },
    { categoryId: 77, slug: "sorcery", label: "Sorcery: Contested Realm" },
    { categoryId: 74, slug: "grand-archive", label: "Grand Archive" },
    { categoryId: 66, slug: "metazoo", label: "MetaZoo" },
    { categoryId: 20, slug: "weiss-schwarz", label: "Weiss Schwarz" },
    { categoryId: 16, slug: "cardfight-vanguard", label: "Cardfight!! Vanguard" },
    { categoryId: 67, slug: "wixoss", label: "WIXOSS" },
    { categoryId: 72, slug: "battle-spirits-saga", label: "Battle Spirits Saga" },
    { categoryId: 73, slug: "shadowverse-evolve", label: "Shadowverse: Evolve" },
    { categoryId: 27, slug: "dragon-ball-masters", label: "Dragon Ball Super: Masters" },
    { categoryId: 88, slug: "godzilla", label: "Godzilla Card Game" },
    { categoryId: 90, slug: "cookierun", label: "CookieRun: Braverse" },
    { categoryId: 83, slug: "elestrals", label: "Elestrals" },
    { categoryId: 25, slug: "universus", label: "UniVersus" },
    { categoryId: 17, slug: "force-of-will", label: "Force of Will" },
    { categoryId: 59, slug: "keyforge", label: "KeyForge" },
    { categoryId: 57, slug: "transformers", label: "Transformers TCG" },
    { categoryId: 58, slug: "bakugan", label: "Bakugan TCG" },
    { categoryId: 26, slug: "star-wars-destiny", label: "Star Wars: Destiny" },
    { categoryId: 23, slug: "dragon-ball-z", label: "Dragon Ball Z TCG" },
    { categoryId: 19, slug: "buddyfight", label: "Future Card BuddyFight" },
    { categoryId: 13, slug: "wow-tcg", label: "World of Warcraft TCG" },
    { categoryId: 54, slug: "warhammer-aos-champions", label: "Warhammer AoS: Champions" },
    { categoryId: 75, slug: "akora", label: "Akora TCG" },
    { categoryId: 76, slug: "kryptik", label: "Kryptik TCG" },
    { categoryId: 78, slug: "alpha-clash", label: "Alpha Clash" },
    { categoryId: 65, slug: "gate-ruler", label: "Gate Ruler" },
    { categoryId: 60, slug: "chrono-clash", label: "Chrono Clash System" },
    { categoryId: 61, slug: "argent-saga", label: "Argent Saga" },
    { categoryId: 64, slug: "alternate-souls", label: "Alternate Souls" },
    { categoryId: 55, slug: "architect", label: "Architect TCG" },
    { categoryId: 30, slug: "metax", label: "MetaX TCG" },
    { categoryId: 48, slug: "lightseekers", label: "Lightseekers TCG" },
    { categoryId: 47, slug: "exodus", label: "Exodus TCG" },
    { categoryId: 36, slug: "zombie-world-order", label: "Zombie World Order" },
    { categoryId: 37, slug: "caster-chronicles", label: "The Caster Chronicles" },
    { categoryId: 38, slug: "mlp-ccg", label: "My Little Pony CCG" },
    { categoryId: 53, slug: "munchkin-ccg", label: "Munchkin CCG" },
    { categoryId: 28, slug: "dragoborne", label: "Dragoborne" },
    { categoryId: 7, slug: "epic", label: "Epic" },
    { categoryId: 10, slug: "redakai", label: "Redakai" },
    { categoryId: 84, slug: "neopets", label: "Neopets Battledome" },
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
