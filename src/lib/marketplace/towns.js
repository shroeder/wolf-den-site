// ── THE SEVEN TOWNS ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Between every map is a town. The town reflects the biome of the next area. The purpose of towns is to
// split up features for unlocking them. The goal here is to help with the player curve, onboarding, as well as
// not exposing features too early. For example, when you fight in the arena at level 1, it's a poor
// experience."
//
// A town sits BEFORE the map it is named for. Town 1 is where a new account starts and opens onto the Grove's
// first forest; town 7 opens onto the Ashen Reach. Clearing a map opens the next town.
//
// ⚠️ THE DESIGN DOC THIS ONCE POINTED AT IS DELETED (2026-11-04, Luke: "serves to really just be a risk
// to regress" -- and it had already drifted, proposing a curve segment the game does not have). The
// measurements behind the ordering are not lost: the ordering IS this table, and what must not be changed
// about it is in docs/grove-release-guide.md 3.2 and the plaza-is-the-city memory.
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
// ✂️ GATING_LIVE WAS HERE, AND THE WHOLE UNLOCK LADDER WITH IT — removed 2026-11-16.
// Luke: "Remove the unlocking entirely. Everything's unlocked day one just like it was before, and
// like I think it still is now. We're just going to release the Grove."
//
// ⚠️ IT NEVER APPLIED TO ANYBODY. GATING_LIVE was false for its whole life, so all 241 accounts had
// gated_at NULL and featureUnlocked returned true for every one of them. Removing this changed no
// member's experience by a single door — it deleted a branch that had never once been taken.
//
// ⚠️ TOWNS STAYS, AND SO DOES EVERY `features` ARRAY. That array had two readers and only one was the
// gate: townStreet(n) uses it to decide which buildings stand on each Grove town's street. Deleting
// the arrays would empty seven streets.

/**
 * Town N opens onto map N, and brings the features listed.
 *
 * ⚠️ THE ORDER IS NOT TASTE, IT IS PACING. Map 1 takes ~30 minutes and map 7 takes ~9 hours, cumulative ~30;
 * so town 2 arrives in half an hour and town 7 about thirty hours in. The early towns therefore carry most of
 * the game and the late ones hold what a thirty-hour player is finally ready for. Spreading features evenly
 * would lock a new member out of the farm for a week.
 */
// ── ⚠️ `features` IS AN UNLOCK SET, NOT A STREET INVENTORY ────────────────────────────────────────────
// It does two jobs and they are easy to confuse:
//
//   FEATURE_TOWN / featureUnlocked   the town at which a gated account UNLOCKS that feature, anywhere
//   townStreet(n)                    which buildings stand on that town's own street
//
// So town 1 listing "tavern" means THE TAVERN UNLOCKS AT TOWN 1 — and the tavern it unlocks is the one in
// the City, which is where the tavern is. It does not mean Rootwood has a pub.
//
// ⚠️ WHICH IS WHY TOWN 1 IS NOT TRIMMED. It reads like a copy of the plaza's starter kit because that is
// precisely what it is: the onboarding unlock set. Stripping it to "grove only" to make Rootwood feel like
// a trailhead would gate pets, the bag and the profile behind deeper Grove progress — the opposite of the
// settled decision that pets open IN FULL at town 1.
//
// Rootwood is a trailhead because of what STANDS on it, not because of what it unlocks.
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
 * ⚠️ THE TILL STANDS ON EVERY STREET.
 *
 * This was NEVER_GATED, half of the unlock ladder that went on 2026-11-16 — but it had a SECOND reader
 * that has nothing to do with gating and outlives it. townStreet() uses this set to decide which
 * buildings are FIXTURES: the ones that stand on every town's street rather than only on the street of
 * the town that lists them. Anything that touches the business — buying, store credit, the Card Vault,
 * selling, events, the rewards track — has to be reachable from wherever the member is standing, and a
 * town with two buildings on it reads as an unfinished game rather than a waystation.
 *
 * Renamed to what it does. Deleting it with the ladder would have emptied six of seven streets.
 */

/** feature → the town number that opens it. Built once from TOWNS, so the table above is the only source. */

/**
 * Which town a member has reached, from how deep they are in the Grove.
 *
 * ⚠️ DEPTH IS zone.n AND NOTHING ELSE — the Grove learned that the hard way when a second notion of depth
 * was double-counted. Twelve zones to a map, and the town AFTER a map opens once its last zone is cleared,
 * so a player standing in map 3 has towns 1-3 and gets town 4 on clearing zone 36.
 */
/**
 * ⚠️ THE TILL STANDS ON EVERY STREET.
 *
 * This list was NEVER_GATED, half of the unlock ladder that went on 2026-11-16 — and deleting it with the
 * ladder broke the build, which was the right way to find out that it had a SECOND reader with nothing to do
 * with gating.
 *
 * townStreet() uses it to decide which buildings are FIXTURES: the ones that stand on EVERY town's street
 * rather than only on the street of the town that lists them. Anything that touches the business — buying,
 * store credit, the Card Vault, selling, events, the rewards track — has to be reachable from wherever a
 * member is standing, and a town with two buildings on it reads as an unfinished game rather than a
 * waystation. Identity and talking to people travel for the same reason.
 *
 * So it is renamed to what it actually does, rather than removed with the thing it used to also serve.
 */
export const STREET_FIXTURES = new Set([
    "shop", "cart", "credit", "mystery", "vault", "sell", "events", "rewards",
    "profile", "notifications", "inbox", "messages", "friends", "invite", "customize",
    "guide", "changelog", "play", "town", "social",
]);

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

