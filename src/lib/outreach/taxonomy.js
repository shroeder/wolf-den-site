// ── TURNING A SQUARE CATEGORY NAME INTO SOMETHING A RULE CAN READ ────────────────────────────────────────────
// The shop's categories are written for a human at a counter, not for a matcher: "Pokemon Single Card",
// "Yu-gi-oh Sealed", "One piece booster pack", "lorcana booster pack" — inconsistent case, inconsistent
// wording, and nine of them are a consignor's first name. This is the one place that reads them.
//
// ⚠️ EVERY PATTERN IS WORD-BOUNDED AND THAT IS NOT STYLE. A bare /tin/ once matched "painting" and filed 99 of
// Pedro's canvases as a card game in the Google feed. [[duplicates-are-the-normal-case]] is the sibling lesson:
// test a matcher against ALL the data, not against the example that prompted it.

const GAMES = [
    ["pokemon", /\bpok[eé]mon?\b/i],
    ["magic", /\bmagic\b|\bmtg\b/i],
    ["yugioh", /\byu-?gi-?oh\b/i],
    ["onepiece", /\bone[\s-]?piece\b/i],
    ["lorcana", /\blorcana\b/i],
    ["dbz", /\bdbz\b|\bdragon\s?ball\b/i],
    ["finalfantasy", /\bfinal\s?fantasy\b/i],
    ["naruto", /\bnaruto\b/i],
    ["sports", /\bsports?\b/i],
];

// Checked BEFORE the game list, because these describe what the thing IS and a consignor category like
// "AJ's Dragon Ball Figures" would otherwise read as a Dragon Ball card buyer.
const KINDS = [
    ["plush", /\bplush(ie)?s?\b/i],
    ["figure", /\bfigures?\b|\bfunko\b/i],
    ["comic", /\bcomics?\b/i],
    ["art", /\bart\b|\bpaintings?\b|\bposters?\b/i],
    ["accessory", /\baccessor(y|ies)\b|\bsleeves?\b|\bbinder\b|\bdeck\s?box\b/i],
    ["food", /\bdrinks?\b|\bfood\b|\bsnacks?\b/i],
    ["bulk", /\bbulk\b/i],
    ["event", /\bevents?\b|\btournament\b/i],
];

const SEALED = /\bsealed\b|\bbooster\b|\bpacks?\b|\bbox(es)?\b|\bbundle\b|\belite\s?trainer\b|\betb\b|\btins?\b|\bcollection\b/i;
const SINGLE = /\bsingles?\b/i;

/**
 * `{ game, format, kind }` for a Square category name. Any of the three may be null, which means
 * "this category does not say" — never a guess.
 */
export function classify(category) {
    const s = String(category || "").trim();
    if (!s) return { game: null, format: null, kind: null };

    for (const [kind, re] of KINDS) if (re.test(s)) return { game: null, format: null, kind };

    let game = null;
    for (const [g, re] of GAMES) if (re.test(s)) { game = g; break; }

    const format = SINGLE.test(s) ? "single" : SEALED.test(s) ? "sealed" : null;
    return { game, format, kind: game || format ? "card" : null };
}

/** What a game is called in a sentence. */
export const GAME_LABEL = {
    pokemon: "Pokémon", magic: "Magic", yugioh: "Yu-Gi-Oh!", onepiece: "One Piece",
    lorcana: "Lorcana", dbz: "Dragon Ball", finalfantasy: "Final Fantasy", naruto: "Naruto", sports: "sports cards",
};

export const KIND_LABEL = {
    plush: "plushies", figure: "figures", comic: "comics", art: "art",
    accessory: "accessories", food: "snacks", bulk: "bulk", event: "events", card: "cards",
};
