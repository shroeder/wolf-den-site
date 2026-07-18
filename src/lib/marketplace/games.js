// The games a member can say they play (drives targeted CTAs like the Friday Night Magic sign-up).
// Keep ids stable — they're stored in mkt_buyer.game_interests.
export const GAMES = [
    { id: "magic", label: "Magic: The Gathering", emoji: "🔵" },
    { id: "pokemon", label: "Pokémon", emoji: "🔴" },
    { id: "lorcana", label: "Disney Lorcana", emoji: "🟣" },
    { id: "yugioh", label: "Yu-Gi-Oh!", emoji: "🟡" },
    { id: "onepiece", label: "One Piece", emoji: "🟠" },
    { id: "other", label: "Something else", emoji: "🎲" },
];

const VALID = new Set(GAMES.map((g) => g.id));

// Keep only known game ids, de-duped, in canonical order.
export function sanitizeGameInterests(list) {
    if (!Array.isArray(list)) return [];
    const set = new Set(list.map((x) => String(x || "").trim().toLowerCase()).filter((x) => VALID.has(x)));
    return GAMES.map((g) => g.id).filter((id) => set.has(id));
}

// The store's Friday Night Magic sign-up link — the Wizards Companion app, joined via the store's short
// code. Registering here builds the store's standing with Wizards for future product allocations.
export const FNM_EVENTLINK_URL = "https://magic.wizards.com/en/products/companion-app?shortCode=YEMZJG7";
