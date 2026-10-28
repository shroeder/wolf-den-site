// ── THE SEVEN TOWNS ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Between every map is a town. The town reflects the biome of the next area. The purpose of towns is to
// split up features for unlocking them. The goal here is to help with the player curve, onboarding, as well as
// not exposing features too early. For example, when you fight in the arena at level 1, it's a poor
// experience."
//
// A town sits BEFORE the map it is named for. Town 1 is where a new account starts and opens onto the Grove's
// first forest; town 7 opens onto the Ashen Reach. Clearing a map opens the next town.
//
// Full design, with the measurements behind the ordering: docs/grove-towns-design.md
//
// ⚠️ THIS FILE IS PURE. No db import, no server-only — the hud route reads it, the route guards read it, and
// the menu reads the answer it produces. One table, three readers, no second copy of the rule.

// ── ⚠️ THE MASTER SWITCH, AND IT IS OFF ──────────────────────────────────────────────────────────────────────
// Luke: "obviously, the grove is still gated until I tell you otherwise."
//
// Which makes this the most dangerous constant in the feature. The Grove is owner-only today, so a new account
// stamped with `gated_at` would be locked out of the farm, the mine, the arena and twenty other rooms WITH NO
// WAY TO UNLOCK ANY OF THEM — the one thing that opens a town is Grove progress, and they cannot reach the
// Grove. Not a degraded experience: an unplayable account, created silently, one signup at a time.
//
// So nothing stamps `gated_at` until this is true. Everything else — the towns, the menu, the route guards,
// the gate check — is live and inert, because every account has a NULL and every gate answers "open".
//
// ⚠️ TURN THIS ON IN THE SAME DEPLOY THAT OPENS THE GROVE, never before it. The two are one switch wearing
// two names.
export const GATING_LIVE = false;

/**
 * Town N opens onto map N, and brings the features listed.
 *
 * ⚠️ THE ORDER IS NOT TASTE, IT IS PACING. Map 1 takes ~30 minutes and map 7 takes ~9 hours, cumulative ~30;
 * so town 2 arrives in half an hour and town 7 about thirty hours in. The early towns therefore carry most of
 * the game and the late ones hold what a thirty-hour player is finally ready for. Spreading features evenly
 * would lock a new member out of the farm for a week.
 */
export const TOWNS = [
    {
        n: 1, id: "rootwood", name: "Rootwood Waystation", biome: "forest", opens: "The Grove",
        blurb: "What a hero is, and who walks with them.",
        // Pets are here in full — Luke's call. It is the best attachment hook in the game and two hours is
        // late for it. The Tavern is here for a different reason: global chat is where the Den's helpers
        // live, and locking a newcomer out of the one room where somebody would answer them is the opposite
        // of onboarding.
        features: ["grove", "inventory", "profile", "pets", "quests", "tavern", "store"],
    },
    {
        n: 2, id: "deepdelve", name: "Deepdelve Camp", biome: "cave", opens: "The Undercave",
        blurb: "Making things.",
        // The forge needs the mine's output to mean anything — apart, the forge is a building full of
        // buttons you cannot press.
        features: ["mining", "blacksmith", "compendium"],
    },
    {
        n: 3, id: "fenhollow", name: "Fenhollow", biome: "swamp", opens: "The Sunken Fen",
        blurb: "Things that grow.",
        features: ["farm", "cooking"],
    },
    {
        n: 4, id: "saltwrack", name: "Saltwrack Landing", biome: "coast", opens: "The Saltwrack Coast",
        blurb: "The water.",
        // Sailing is the long-form idle loop and wants a player who has a reason to come back. Four hours
        // in, they have one.
        features: ["sailing", "fishing", "bounties"],
    },
    {
        n: 5, id: "drownedquay", name: "Drowned Quay", biome: "ruins", opens: "The Drowned Ruins",
        blurb: "Risk, and what you keep.",
        // Dungeons are the first content that can genuinely stop you — correct at eight hours, miserable at
        // twenty minutes. Creations is here on COST grounds rather than curve: it spends real money per
        // image on an AI call.
        features: ["dungeons", "jeweller", "sets", "creations", "cards"],
    },
    {
        n: 6, id: "gilded", name: "Gilded Exchange", biome: "gold", opens: "The Gilded Waste",
        blurb: "Other people's money.",
        // A market is only a market when you have something another player wants. An empty auction house on
        // day one teaches a new member the feature is dead. The casino and the spin are gold SINKS, and a
        // player with no gold to lose cannot enjoy either.
        features: ["market", "auction", "trade", "casino", "spin"],
    },
    {
        n: 7, id: "ashfall", name: "Ashfall Bastion", biome: "fire", opens: "The Ashen Reach",
        blurb: "War.",
        // The feature that started this: twenty-one hours of getting stronger before the game asks you to
        // fight another member. The rest are about comparing yourself to the Den, which is the last thing a
        // new player should be invited to do.
        features: ["arena", "boss", "leaderboard", "trophies", "track", "badges"],
    },
];

/**
 * ⚠️ THE TILL IS NEVER LOCKED.
 *
 * Anything that touches the business is open from the first second for every account, forever: buying,
 * store credit, mystery bags, the Card Vault, selling cards, events — and the rewards track, which pays
 * points on a purchase made on day one. A locked rewards page is a locked customer.
 *
 * Identity and talking to people are not features to be earned either. The game gates GAME systems; it never
 * gates a way to give the Den money, or a way to reach somebody.
 */
export const NEVER_GATED = new Set([
    "shop", "cart", "credit", "mystery", "vault", "sell", "events", "rewards",
    "profile", "notifications", "inbox", "messages", "friends", "invite", "customize",
    "guide", "changelog", "play", "town", "social",
]);

/** feature → the town number that opens it. Built once from TOWNS, so the table above is the only source. */
export const FEATURE_TOWN = Object.fromEntries(
    TOWNS.flatMap((t) => t.features.map((f) => [f, t.n])),
);

/**
 * Which town a member has reached, from how deep they are in the Grove.
 *
 * ⚠️ DEPTH IS zone.n AND NOTHING ELSE — the Grove learned that the hard way when a second notion of depth
 * was double-counted. Twelve zones to a map, and the town AFTER a map opens once its last zone is cleared,
 * so a player standing in map 3 has towns 1-3 and gets town 4 on clearing zone 36.
 */
export const townFromDepth = (unlockedN) => {
    const n = Math.max(1, Number(unlockedN) || 1);
    return Math.min(TOWNS.length, Math.floor((n - 1) / 12) + 1);
};

/**
 * Is this feature open to this member?
 *
 * @param {object|null} buyer  needs `gated_at` — NULL means an account from before gating, exempt forever
 * @param {string} feature     the key used in FEATURE_TOWN / NEVER_GATED
 * @param {number} unlockedN   the member's deepest unlocked Grove zone (mkt_grove_player.unlocked_n)
 *
 * ⚠️ UNKNOWN FEATURES ARE OPEN, DELIBERATELY. A feature nobody has added to TOWNS is a feature nobody
 * decided to gate, and the safe failure for a door is to stand open — a typo that silently locks the farm
 * for every new member is a far worse outcome than one that fails to lock something. The same rule as every
 * other lookup in this codebase: fail toward the permissive answer when the gate is the new thing.
 */
export function featureUnlocked(buyer, feature, unlockedN = 1) {
    if (!feature) return true;
    if (NEVER_GATED.has(feature)) return true;
    // The grandfather clause. Every account that existed when gating shipped has a NULL here.
    if (!buyer?.gated_at) return true;
    const need = FEATURE_TOWN[feature];
    if (!need) return true;
    return townFromDepth(unlockedN) >= need;
}

/** Everything still shut, for the menu — so a locked row can say WHICH map opens it rather than just "no". */
export function lockedFeatures(buyer, unlockedN = 1) {
    if (!buyer?.gated_at) return {};
    const town = townFromDepth(unlockedN);
    const out = {};
    for (const t of TOWNS) {
        if (t.n <= town) continue;
        for (const f of t.features) out[f] = { town: t.n, name: t.name, opens: t.opens };
    }
    return out;
}
