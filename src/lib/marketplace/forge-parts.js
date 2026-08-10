// ── FORGE PARTS — THE CATALOG, IN A PURE MODULE ──────────────────────────────────────────────────────────────
// The tiered salvage currency (Cinder Scrap … Emberheart Shard). This is plain data with painted sprites, and
// it lived inside crafting.js — which is `server-only` — so no client component could reach it. The mining
// screens, which mint these things, worked around that by re-typing the NAMES into components/mining/kit.js
// and dropping the art on the floor: the smelt reveal announced "2× Iron Filings" as bare text while the
// sprite for Iron Filings sat right here, already generated and already paid for.
//
// Pure module, no DB, no server-only. Anything that needs a part's name, colour or sprite imports it from
// here — client or server. crafting.js re-exports PART_TIERS so its own callers are unaffected.
export const PART_TIERS = [
    { tier: 1, name: "Cinder Scrap", color: "#c39b6a", glyph: "GiMetalBar", sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/parts/cinder-scrap-v2-1785086093272.png" },
    { tier: 2, name: "Iron Filings", color: "#cfd6dd", glyph: "GiStakeHammer", sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/parts/iron-filings-v2-1785086110602.png" },
    { tier: 3, name: "Tempered Steel", color: "#6fb0e6", glyph: "GiGoldBar", sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/parts/tempered-steel-1785085332258.png" },
    { tier: 4, name: "Mythril Dust", color: "#b98cff", glyph: "GiCrystalize", sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/parts/mythril-dust-1785085353020.png" },
    { tier: 5, name: "Emberheart Shard", color: "#ffb020", glyph: "GiCrystalCluster", sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/forge/parts/emberheart-shard-1785085371947.png" },
];

const BY_TIER = new Map(PART_TIERS.map((p) => [p.tier, p]));

/** The whole part record for a tier (1..5), or null. */
export const partForTier = (tier) => BY_TIER.get(Number(tier)) || null;
/** Display name for a tier — the lookup components/mining/kit.js used to hard-code. */
export const partName = (tier) => partForTier(tier)?.name || `Tier ${tier} part`;
/** Painted sprite URL for a tier, or null if one was never generated. */
export const partSprite = (tier) => partForTier(tier)?.sprite || null;
/** Rarity-ladder colour for a tier. */
export const partColor = (tier) => partForTier(tier)?.color || "#cdd3d8";
