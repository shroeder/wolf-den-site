// Visual forge-rank for enhanced gear — a rank that extends N times as an item's enhancement level climbs.
// Reflected across the site (owner-gated) + the admin app. AI-generated emblem sprite per tier (the top emblem
// + color are reused for tiers beyond the set, while the roman-numeral label keeps climbing forever).
// Isomorphic (no server-only) so both React and server routes can use it.

export const RANK_EMBLEMS = [
    "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/rank-1-1785049033419.png",
    "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/rank-2-1785049053993.png",
    "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/rank-3-1785049073030.png",
    "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/rank-4-1785049093262.png",
    "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/rank-5-1785049113146.png",
];

const RANK_COLORS = ["#c08a52", "#c7d0d8", "#6fb0e6", "#b98cff", "#ffb020"];
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
const roman = (n) => ROMAN[n] || String(n);

// level → visual rank. Every 4 enhance levels bumps the tier; tiers extend forever.
export function forgeRank(level) {
    const lv = Number(level) || 0;
    if (lv < 1) return null;
    const tier = Math.floor((lv - 1) / 4) + 1;
    const idx = Math.min(tier, RANK_EMBLEMS.length) - 1;
    const emblem = RANK_EMBLEMS[idx] && !RANK_EMBLEMS[idx].startsWith("__") ? RANK_EMBLEMS[idx] : null;
    return { level: lv, tier, color: RANK_COLORS[Math.min(tier, RANK_COLORS.length) - 1], emblem, label: `Forged ${roman(tier)}` };
}
