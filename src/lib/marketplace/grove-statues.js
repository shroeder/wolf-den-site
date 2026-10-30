// ── STATUES ──────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I think we gota figure out how to make meaning behind volume of items making it worth to collect lots
// of them. Maybe enemies have statues in their drop table. Like a statue of strength, etc. And they can turn
// them in to a statue vendor. Reaching breakpoint. Each increasing its corresponding stat."
//
// This is the answer to a real hole: the Grove asks for tens of thousands of kills and almost nothing in it
// cares how many you have done, only how deep you got. Parts cap out the moment a recipe is made, cards cap at
// six stars, gold is spent. Statues are the first thing where the hundredth is worth the same as the first.
//
// ⚠️ PURE. No db, no server-only — the panel does the same arithmetic the server does, so a bar can fill
// optimistically and still be right. See grove-catalog.js for the same rule.

/**
 * ── ⚠️ FIVE TYPES, NOT FOURTEEN ──────────────────────────────────────────────────────────────────────────────
 * One statue per stat, and only the five flat combat stats. The temptation is one per stat in the game, and it
 * is wrong twice: a statue of crit rate is a statue of a percentage, which does not read as an object you put
 * on a shelf; and spreading an emblem-rare drop across fourteen lines means a given statue arrives about once
 * every five thousand kills, which is not a collection, it is a rumour.
 *
 * Five lines at emblem rarity is roughly one of a GIVEN statue every ~1,900 kills — about a node and a half at
 * map four. That is the number the costs below are set against.
 */
export const STATUE_STATS = [
    { stat: "might", name: "Statue of Might", blurb: "A fist, closed, and larger than the figure holding it." },
    { stat: "vitality", name: "Statue of Vitality", blurb: "Standing, with both lungs carved open to the air." },
    { stat: "armour", name: "Statue of the Wall", blurb: "A figure with no face and a very good shield." },
    { stat: "ferocity", name: "Statue of Ferocity", blurb: "Mid-swing. Whoever carved it did not finish the other arm." },
    { stat: "tenacity", name: "Statue of Tenacity", blurb: "Kneeling, and getting up. That is the whole carving." },
];

export const STATUE_STAT_IDS = STATUE_STATS.map((s) => s.stat);
export const statueMeta = (stat) => STATUE_STATS.find((s) => s.stat === stat) || null;

/**
 * ── ⚠️ RARITY IS WORTH MORE, IT IS NOT A SEPARATE BAR ────────────────────────────────────────────────────────
 * Luke: "Rarer statues count for more." So all three pour into the same bar and a crystal is simply four
 * regulars. The alternative — a bar per rarity — would mean a player who finds a prismatic early cannot spend
 * it, which is the exact opposite of "volume is worth something".
 */
export const STATUE_RARITIES = [
    { id: "regular", name: "Statue", worth: 1, colour: "#b9b2a0", minVendorTier: 1 },
    { id: "crystal", name: "Crystal Statue", worth: 4, colour: "#7fd4e8", minVendorTier: 2 },
    { id: "prismatic", name: "Prismatic Statue", worth: 16, colour: "#d08aff", minVendorTier: 3 },
];
export const rarityMeta = (id) => STATUE_RARITIES.find((r) => r.id === id) || STATUE_RARITIES[0];

/**
 * Which vendor tier a player has, from how deep they have been.
 *
 * Luke: "the vendor base form is part of world 2. And statues dont start dropping until world 2… maybe at
 * world 8 and 12 unlocks new tiers of statue vendors allowing you to find different rarity of statues."
 *
 * ⚠️ THE TIER GATES THE DROP, NOT THE TURN-IN. A crystal found before tier 2 cannot happen, but a crystal
 * already held is always spendable — a bar that refuses a statue you are holding is a bug as far as anyone
 * playing is concerned.
 */
export const VENDOR_TIER_MAP = { 1: 2, 2: 8, 3: 12 };
export function vendorTier(deepestMap) {
    const m = Number(deepestMap) || 0;
    if (m >= VENDOR_TIER_MAP[3]) return 3;
    if (m >= VENDOR_TIER_MAP[2]) return 2;
    if (m >= VENDOR_TIER_MAP[1]) return 1;
    return 0;
}

/** Which rarities can DROP at a tier. Tier 0 is "no statues yet" — they start at world 2. */
export function rarityWeights(tier) {
    if (tier <= 0) return null;
    if (tier === 1) return { regular: 1 };
    if (tier === 2) return { regular: 0.85, crystal: 0.15 };
    return { regular: 0.78, crystal: 0.19, prismatic: 0.03 };
}

/**
 * ── ⚠️ EVERY LEVEL COSTS MORE THAN THE LAST ──────────────────────────────────────────────────────────────────
 * Luke: "It fills a bar. Every time you achieve a new level it takes more statues."
 *
 * Cost of level n is 2n + 1, so 3, 5, 7, 9 … and the TOTAL to reach level n is n(n+2). Level 10 is 120 points.
 * At one statue of a given type per ~1,900 kills that is a very long chase, which is the point — but the first
 * level lands at 3 and the second at 8, so the bar moves early and visibly.
 *
 * ⚠️ NO CAP IN THE DATA. A hard maximum would make the hundredth statue worthless again, which is the thing
 * this whole system exists to fix. MAX_SHOWN is a display convenience only.
 */
export const levelCost = (level) => 2 * (Number(level) || 0) + 1;
export const totalForLevel = (level) => { const n = Number(level) || 0; return n * (n + 2); };
export const MAX_SHOWN = 10;

/** Level reached for a points total, plus how far into the next one. */
export function statueLevel(points) {
    const p = Math.max(0, Number(points) || 0);
    let level = 0;
    while (totalForLevel(level + 1) <= p) level += 1;
    const floor = totalForLevel(level);
    const next = levelCost(level + 1);
    return { level, into: p - floor, next, pct: next ? Math.round(((p - floor) / next) * 100) : 100 };
}

/**
 * ── ⚠️ THE DOUBLINGS ARE PERMANENT AND THEY ARE THE REWARD ───────────────────────────────────────────────────
 * Luke: "upon first turning one in, it permanently doubles the bonus and it changes color. And again on the
 * rarest statue."
 *
 * So a crystal is worth four regulars AND, the first time, doubles everything that line will ever give. The
 * first prismatic doubles again. A line that has seen both is 4x for the rest of the account's life, and the
 * bar is a different colour, which is the part people will actually chase.
 *
 * ⚠️ FIRST, NOT EVERY. The second crystal is just four points. Doubling per crystal would make the line
 * exponential and the whole stat table meaningless inside a week.
 */
export function multiplier({ crystalSeen = false, prismaticSeen = false } = {}) {
    return (crystalSeen ? 2 : 1) * (prismaticSeen ? 2 : 1);
}

/** The colour a line is wearing, which is how a player reads its history at a glance. */
export function lineColour({ crystalSeen = false, prismaticSeen = false } = {}) {
    if (prismaticSeen) return rarityMeta("prismatic").colour;
    if (crystalSeen) return rarityMeta("crystal").colour;
    return rarityMeta("regular").colour;
}

/**
 * What a line actually grants. One point of the stat per level, times the doublings.
 *
 * ⚠️ FLAT POINTS, THE SAME UNITS GEAR USES. These feed addGroveStat alongside cards and gear, so a statue
 * point and a gear point have to mean the same thing — see grove-kit.js. A percentage here would need its own
 * curve and would not stack legibly with anything.
 */
export function statueBonus({ points = 0, crystalSeen = false, prismaticSeen = false } = {}) {
    const { level } = statueLevel(points);
    return level * multiplier({ crystalSeen, prismaticSeen });
}

/** Every line's contribution, as the bag addGroveStat wants. */
export function statueBonuses(rows = []) {
    const out = {};
    for (const r of rows || []) {
        if (!STATUE_STAT_IDS.includes(r.stat)) continue;
        const v = statueBonus(r);
        if (v) out[r.stat] = (out[r.stat] || 0) + v;
    }
    return out;
}

/**
 * ── ⚠️ AS RARE AS AN EMBLEM, DELIBERATELY ────────────────────────────────────────────────────────────────────
 * Luke: "Its about as rare as emblems." Map creatures roll an emblem at 0.0024 and map-one's hand-authored
 * roster sits between 0.0014 and 0.0026, so this is the middle of that band. It is rolled INDEPENDENTLY of the
 * emblem — a kill that drops a card can drop a statue too, and making them exclusive would mean the rarest
 * moment in the game quietly suppressing the other rarest moment.
 */
export const STATUE_CHANCE = 0.0022;
