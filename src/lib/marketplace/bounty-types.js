// Bounty categories — shared by the server engine and the client UI (so no "server-only" import here).
export const BOUNTY_TYPES = [
    { id: "learn_game", label: "Learn a game", icon: "🎓", blurb: "Get help learning how to play" },
    { id: "pickup_game", label: "Pickup game", icon: "🎲", blurb: "Find players for a game" },
    { id: "find_card", label: "Card hunt", icon: "🃏", blurb: "Help finding a specific card" },
    { id: "trade", label: "Trade partner", icon: "🤝", blurb: "Looking to trade" },
    { id: "deck_help", label: "Deck help", icon: "🛠️", blurb: "Build or tune a deck" },
    { id: "event_partner", label: "Event partner", icon: "🏆", blurb: "A teammate for a tournament or event" },
    { id: "rules_help", label: "Rules & judging", icon: "📖", blurb: "Rules questions or a judge" },
    { id: "alters", label: "Alters & painting", icon: "🎨", blurb: "Paint minis or alter cards" },
    { id: "buy_sell", label: "Buy / Sell", icon: "📦", blurb: "Looking to buy or sell product" },
    { id: "mentor", label: "Mentorship", icon: "🧑‍🏫", blurb: "Ongoing coaching" },
    { id: "content", label: "Content & photos", icon: "📸", blurb: "Photos, streaming, content help" },
    { id: "other", label: "Other", icon: "❓", blurb: "Something else" },
];

export const BOUNTY_TYPE_BY_ID = Object.fromEntries(BOUNTY_TYPES.map((t) => [t.id, t]));

export const MIN_BOUNTY = 10;
export const MAX_BOUNTY = 1_000_000;
export const BOUNTY_DAYS = 14;
