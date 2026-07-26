// Visual forge-rank for enhanced gear — colored STARS that reflect the enhancement level with NO numbers.
// Each color tier holds 3 levels (1★ · 2★ · 3★); climbing past 3★ bumps to the next color. It caps at the top
// tier (peak enchantment). Isomorphic (no server-only) so both React and server routes can use it.

// The color ladder: our rarity palette (bronze → silver → gold → platinum-blue → amethyst-purple → emerald-green)
// then an invented top tier (prismatic/rainbow). 3 stars each → MAX_FORGE_LEVEL = 21 (the peak).
export const STAR_TIERS = [
    { name: "Bronze", color: "#c08a52", rainbow: false },
    { name: "Silver", color: "#cfd6dd", rainbow: false },
    { name: "Gold", color: "#ffcf3f", rainbow: false },
    { name: "Platinum", color: "#5bd4ff", rainbow: false },
    { name: "Amethyst", color: "#b061ff", rainbow: false },
    { name: "Emerald", color: "#3fe08a", rainbow: false },
    { name: "Prismatic", color: "#ff8adf", rainbow: true },
];
export const MAX_FORGE_LEVEL = STAR_TIERS.length * 3; // 21 — the peak (3 prismatic stars)

// level → { stars: 1..3, color, rainbow, tierName, maxed }. Null for un-enhanced gear.
export function forgeRank(level) {
    const lv = Number(level) || 0;
    if (lv < 1) return null;
    const capped = Math.min(lv, MAX_FORGE_LEVEL);
    const tierIdx = Math.floor((capped - 1) / 3);
    const t = STAR_TIERS[tierIdx];
    const stars = ((capped - 1) % 3) + 1;
    const maxed = lv >= MAX_FORGE_LEVEL;
    return { level: lv, stars, color: t.color, rainbow: t.rainbow, tierName: t.name, tierIdx, maxed, label: `${t.name} ${"★".repeat(stars)}${maxed ? " · MAX" : ""}` };
}
