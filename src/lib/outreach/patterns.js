// ── WHAT IS ACTUALLY IN A CARD'S NAME ────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "You will see patterns in behavior for sure. Some people like specific pokemon. Other
// peoole like to buy dual lands. Some like a good deal."
//
// The category told us "Pokemon Single Card" for 426 of the lines members have bought, which is true of
// almost everything in the shop and therefore says almost nothing. The signal was in the name the whole time
// and the first version of this feature threw it away:
//
//     Umbreon (13) 13/75 Holo Rare HP
//     Charizard EX - XY121 Promo NM
//     Mega Greninja ex - 116/086 Special Illustration Rare NM
//
// Four facts in each: WHO is on the card, what SET it is from, how RARE it is, and what CONDITION it is in.
// Three of those are extractable with a regex and the fourth — "these three are all Eeveelutions", "these
// are all dual lands" — needs to know something about the game, which is where the model earns its place.

/** Condition grades as the shop writes them, worst to best. */
const CONDITIONS = ["DMG", "HP", "MP", "LP", "NM"];
const CONDITION_RE = /\b(NM|LP|MP|HP|DMG)\b\s*$/i;

const RARITY_RE = /\b(Special Illustration Rare|Illustration Rare|Ultra Rare|Secret Rare|Hyper Rare|Double Rare|Holo Rare|Rare Holo|Promo|Rare|Uncommon|Common)\b/i;

// The printed collector number, which is also the reliable left edge of all the metadata.
const NUMBER_RE = /\b\d{1,3}\/\d{1,3}[a-z]?\b|\b(?:RC|TG|SV|GG|SWSH|XY|BW|HGSS|DP)\d+(?:\/\w+)?\b/i;

// Prefixes and suffixes that decorate a character rather than name one.
const MECHANIC_RE = /^(M|Mega|Radiant|Shining|Dark|Light|Team\s+\w+'?s?)\s+/i;
const SUFFIX_RE = /\s+(ex|EX|GX|V|VMAX|VSTAR|BREAK|Prime|LEGEND|Tag Team|δ)\b.*$/;

/**
 * `{ character, rarity, condition, number }` for one item name. Any field may be null.
 *
 * ⚠️ THE CHARACTER IS TAKEN FROM THE LEFT, NOT MATCHED AGAINST A LIST. A list of Pokémon names would be 1,025
 * entries that goes stale every set, would not cover Magic or One Piece at all, and would still miss the
 * thing it was built for. Everything a card name carries to the RIGHT of the character is structured — a
 * collector number, a rarity, a condition, a set code — so the character is simply what is left when the
 * structure is removed. That works for games this code has never heard of.
 */
export function entitiesOf(name) {
    const raw = String(name || "").trim();
    if (!raw) return { character: null, rarity: null, condition: null, number: null };

    const condition = (raw.match(CONDITION_RE)?.[1] || "").toUpperCase() || null;
    const rarity = raw.match(RARITY_RE)?.[0] || null;
    const number = raw.match(NUMBER_RE)?.[0] || null;

    // Cut at the first piece of metadata, whichever comes first.
    let head = raw;
    for (const re of [NUMBER_RE, RARITY_RE, /\s[-–]\s/, /\s*\(\d+\)/]) {
        const m = head.match(re);
        if (m && m.index > 0) head = head.slice(0, m.index);
    }
    head = head.replace(SUFFIX_RE, "").replace(MECHANIC_RE, "").replace(/[^\w\s'.:-]/g, " ").replace(/\s+/g, " ").trim();

    // ── ⚠️ A CHARACTER ONLY EXISTS ON A SINGLE CARD ─────────────────────────────────────────────────
    // Without this gate "Mystery Pack" is a character called Mystery and "Pokemon Bulk" is one called
    // Pokemon — and they are the two most-bought lines in the shop, so they dominated every ranking of
    // who-is-attached-to-what. One member showed as devoted to "MYSTERY" 17 times.
    //
    // The test is structural, not a blocklist of product words: a collector number or a printed rarity is
    // what makes a name a CARD rather than a product, and sealed product has neither. That holds for games
    // this code has never seen, which a list of words like "booster" and "tin" never would.
    const isSingle = Boolean(number || rarity);
    const character = isSingle && head && head.length >= 3 && head.split(/\s+/).length <= 4 ? head : null;
    return { character, rarity, condition, number, isSingle };
}

/** Where a member sits on the condition ladder: 1 is mint-only, 0 is buys anything played. */
export function conditionTaste(conditions) {
    const scored = conditions.map((c) => CONDITIONS.indexOf(String(c || "").toUpperCase())).filter((i) => i >= 0);
    if (!scored.length) return null;
    return scored.reduce((a, b) => a + b, 0) / scored.length / (CONDITIONS.length - 1);
}

/** The repeated things in a list of names, most repeated first. */
export function recurring(names, field = "character") {
    const counts = new Map();
    for (const n of names) {
        const v = entitiesOf(n)[field];
        if (!v) continue;
        const k = v.toLowerCase();
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}
