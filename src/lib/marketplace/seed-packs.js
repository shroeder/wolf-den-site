// Tiered seed packs — the ONLY way to get seeds now (you can't buy individual seeds). Bought in the shop,
// opened from the farm. Basic packs give everyday crops only; each higher tier costs a lot more and unlocks
// better crops. The rarity WEIGHTS drive what a pack rolls. Leaf module (no imports) so the consumables catalog,
// the farm, and the client can all share one source of truth without an import cycle.
export const SEED_PACKS = [
    {
        id: "farm_seed_packet",
        name: "Basic Seed Packet",
        emoji: "🌱",
        tier: 1,
        count: 3,
        price: 500,
        desc: "3 everyday crop seeds — wheat, carrot, potato and the odd berry. No premium crops.",
        weights: { common: 74, rare: 26 },
    },
    {
        id: "farm_seed_crate",
        name: "Bountiful Seed Crate",
        emoji: "📦",
        tier: 2,
        count: 4,
        price: 4000,
        desc: "4 seeds skewed to prized crops — rare & epic, with a slim shot at a legendary.",
        weights: { rare: 52, epic: 43, legendary: 5 },
    },
    {
        id: "farm_seed_vault",
        name: "Legendary Seed Vault",
        emoji: "🗝️",
        tier: 3,
        count: 5,
        price: 18000,
        desc: "5 premium seeds — epic & legendary, with a real shot at the mythic Star Fruit.",
        weights: { epic: 55, legendary: 36, mythic: 9 },
    },
];

export const SEED_PACK_IDS = SEED_PACKS.map((p) => p.id);
export const seedPackById = (id) => SEED_PACKS.find((p) => p.id === id) || null;
