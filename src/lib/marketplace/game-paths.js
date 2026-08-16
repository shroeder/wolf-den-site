// ── WHAT COUNTS AS "IN THE GAME" ─────────────────────────────────────────────────────────────────────────────
// One definition, shared. The game nav and the Pathfinder strip both have to self-hide on non-game pages, and
// two copies of this list would drift the moment a feature is added — a new area would keep the nav and quietly
// lose the guide, which is exactly the "abandons you in certain places" problem.
//
// Pure data + one predicate. No imports, so a server file can use it too.

// Areas that ARE their own nav destination.
export const GAME_NAV_PATHS = [
    "/marketplace/play", "/marketplace/guide", "/marketplace/profile", "/marketplace/customize",
    "/marketplace/boss", "/marketplace/sailing", "/marketplace/spin", "/marketplace/pets",
    "/marketplace/inventory", "/marketplace/store", "/marketplace/sets", "/marketplace/quests",
    "/marketplace/track", "/marketplace/badges", "/marketplace/leaderboard", "/marketplace/bounties",
    "/marketplace/invite", "/marketplace/creations", "/marketplace/credit", "/marketplace/changelog",
    "/marketplace/compendium",
];

// Part of the game shell but not their own nav entry.
export const GAME_EXTRA_PATHS = [
    "/marketplace/u/", "/marketplace/fishing", "/marketplace/rewards", "/marketplace/farm",
    "/marketplace/trade", "/marketplace/friends", "/marketplace/inbox", "/marketplace/dm",
    "/marketplace/town", "/marketplace/auction", "/marketplace/cooking", "/marketplace/mining",
    "/marketplace/dungeons", "/marketplace/arena", "/marketplace/blacksmith", "/marketplace/events", "/marketplace/notifications",
    // The Jewelcutter was missing from BOTH lists, so the bench lost the game nav and the Pathfinder strip
    // together — you could walk in and have no way back out except the browser button. It is the exact
    // "abandons you in certain places" failure this file was written to prevent, on a page that shipped after
    // the file did. The other unlisted /marketplace/* dirs are checkout, auth, vendor and admin surfaces,
    // which are correctly not part of the game shell.
    "/marketplace/jeweller",
    // The Market — owner-gated, but it still has to be a KNOWN game path or the nav and the Pathfinder strip
    // both vanish the moment you walk in, which is the exact trap the Jewelcutter fell into above.
    "/marketplace/market",
];

const ALL = [...GAME_NAV_PATHS, ...GAME_EXTRA_PATHS];

/** Is this pathname somewhere inside the game (as opposed to the shop, vendor or admin surfaces)? */
export function isGamePath(pathname = "") {
    return ALL.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}
