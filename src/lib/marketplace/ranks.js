// Wolf-themed rank titles, unlocked at milestone levels. Pure (no server-only) so both server
// components and client components can import it. Titles are recognition/flavor — they cost nothing
// and commit the store to nothing, but they give the level ladder a name and a next thing to chase.
export const RANKS = [
    { level: 1, title: "Cub", emoji: "🐾" },
    { level: 5, title: "Pack Runner", emoji: "🐺" },
    { level: 10, title: "Night Hunter", emoji: "🌙" },
    { level: 15, title: "Pathfinder", emoji: "🧭" },
    { level: 20, title: "Pack Elder", emoji: "🌲" },
    { level: 25, title: "Alpha", emoji: "👑" },
    { level: 30, title: "Legend", emoji: "⭐" },
    { level: 40, title: "Mythic", emoji: "🔥" },
    { level: 50, title: "Ascended", emoji: "💫" },
];

// The rank a member currently holds — the highest tier they've reached.
export function rankForLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    let current = RANKS[0];
    for (const r of RANKS) {
        if (lvl >= r.level) current = r;
    }
    return current;
}

// The next rank to chase (with the level it unlocks at), or null if already at the top.
export function nextRank(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return RANKS.find((r) => r.level > lvl) || null;
}

// Level-gated perks beyond badges. `soon: true` = designed but not built yet (custom borders, profile
// flair, etc.) — they show on the rewards track as "Coming soon" so members see what's ahead. As each
// feature ships, flip soon → false (and wire the unlock); the track picks it up with no layout change.
export const LEVEL_PERKS = [
    { level: 5, icon: "🥉", label: "Bronze profile border", soon: true },
    { level: 15, icon: "🥈", label: "Silver profile border", soon: true },
    { level: 20, icon: "🎨", label: "Profile flair & accents", soon: true },
    { level: 30, icon: "🥇", label: "Gold profile border", soon: true },
    { level: 40, icon: "✨", label: "Animated name effect", soon: true },
    { level: 50, icon: "🌈", label: "Legendary animated border", soon: true },
];

