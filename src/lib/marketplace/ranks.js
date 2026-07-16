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
    { level: 60, title: "Celestial", emoji: "🌠" },
    { level: 70, title: "Empyrean", emoji: "☄️" },
    { level: 80, title: "Eternal", emoji: "♾️" },
    { level: 90, title: "Ragnarök", emoji: "⚡" },
    { level: 100, title: "Fenrir", emoji: "🐺" },
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

// Level-gated perks BEYOND badges & borders (which the track sources from their own catalogs). These
// are future cosmetics not built yet — `soon: true` shows them on the track as "Coming soon". As each
// ships, flip soon → false and wire the unlock; the track picks it up with no layout change.
export const LEVEL_PERKS = [
    { level: 25, icon: "🎨", label: "Custom name color", soon: true },
    { level: 45, icon: "✨", label: "Animated name effect", soon: true },
];

