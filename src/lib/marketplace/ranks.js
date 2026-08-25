// Wolf-themed rank titles, unlocked at milestone levels. Pure (no server-only) so both server
// components and client components can import it. Titles are recognition/flavor — they cost nothing
// and commit the store to nothing, but they give the level ladder a name and a next thing to chase.
//
// ── AND EACH ONE HAS A COLOUR ────────────────────────────────────────────────────────────────────────────────
// Added for the role chips in chat (see roles.js), where a rank is the DEFAULT role everybody wears. Luke:
// "each role has its own color." They climb deliberately — grey and blue at the bottom, green through gold in
// the middle, violet and then white at the top — so a chip's colour says roughly how far up somebody is before
// the word is read. The ladder itself is untouched; this is one more field on rows that already existed.
export const RANKS = [
    { level: 1, title: "Cub", tone: "#9aa7b5", emoji: "🐾" },
    { level: 5, title: "Pack Runner", tone: "#8fd3ff", emoji: "🐺" },
    { level: 10, title: "Night Hunter", tone: "#5ac8f0", emoji: "🌙" },
    { level: 15, title: "Pathfinder", tone: "#4fc98a", emoji: "🧭" },
    { level: 20, title: "Pack Elder", tone: "#37f5c0", emoji: "🌲" },
    { level: 25, title: "Alpha", tone: "#b8e832", emoji: "👑" },
    { level: 30, title: "Legend", tone: "#ffc24a", emoji: "⭐" },
    { level: 40, title: "Mythic", tone: "#ff8a2b", emoji: "🔥" },
    { level: 50, title: "Ascended", tone: "#ff6f7d", emoji: "💫" },
    { level: 55, title: "Warbringer", tone: "#e8355e", emoji: "⚔️" },
    { level: 60, title: "Celestial", tone: "#c46bff", emoji: "🌠" },
    { level: 65, title: "Starforged", tone: "#b45aff", emoji: "🌟" },
    { level: 70, title: "Empyrean", tone: "#8f5aff", emoji: "☄️" },
    { level: 75, title: "Voidwalker", tone: "#6b7cff", emoji: "🌀" },
    { level: 80, title: "Eternal", tone: "#4fd6ff", emoji: "♾️" },
    { level: 85, title: "Worldeater", tone: "#ff9a3c", emoji: "🌋" },
    { level: 90, title: "Ragnarök", tone: "#ffe27a", emoji: "⚡" },
    { level: 95, title: "Godspaw", tone: "#fff3c4", emoji: "☀️" },
    { level: 100, title: "Fenrir", tone: "#ffffff", emoji: "🐺" },
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

