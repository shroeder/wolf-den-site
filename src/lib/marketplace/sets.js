import "server-only";

// Themed gear SETS. Equip N matching pieces to unlock tiered bonuses (extra stats on top of the items).
// Unlike items (which are budget-neutral), set bonuses ADD power — the reward for committing to a themed
// build instead of pure best-in-slot. Bonuses flow through the normal stat pipeline (might / crit_chance /
// crit_power / ferocity / fortune / extra_strike), so they buff manual hits, auto-DPS, tickets, and daily
// strikes automatically — no special combat code. Sets deliberately span different slots so a full bonus
// is achievable, and mix rarities so collecting a set is its own goal.

export const ITEM_SETS = [
    {
        id: "warlord", name: "Warlord's Regalia",
        items: ["executioner_axe", "centurion_helm", "warlord_plate", "war_girdle", "warlord_ring"],
        bonuses: [
            { need: 2, stats: { might: 8 } },
            { need: 4, stats: { might: 12, crit_power: 12 } },
        ],
    },
    {
        id: "dragon", name: "Dragonlord's Aspect",
        items: ["dragonfang_blade", "dragon_shield", "dragonplate", "dragoncape", "dragonheart_sigil"],
        bonuses: [
            { need: 2, stats: { ferocity: 8 } },
            { need: 4, stats: { might: 12, ferocity: 12 } },
        ],
    },
    {
        id: "void", name: "Voidbound",
        items: ["void_maelstrom", "voidwalkers", "eternity_band", "galaxy_pendant", "cosmic_sash"],
        bonuses: [
            { need: 2, stats: { fortune: 10 } },
            { need: 4, stats: { ferocity: 14, fortune: 14 } },
        ],
    },
    {
        id: "ranger", name: "Wildstalker's Kit",
        items: ["hunters_bow", "rangers_hood", "swift_boots", "focus_band"],
        bonuses: [
            { need: 2, stats: { crit_chance: 6 } },
            { need: 4, stats: { crit_chance: 8, crit_power: 12 } },
        ],
    },
    {
        id: "titan", name: "Titanforged",
        items: ["worldflame_maul", "starforged_mail", "colossus_belt", "kings_eternal"],
        bonuses: [
            { need: 2, stats: { might: 10 } },
            { need: 4, stats: { might: 16, extra_strike: 1 } },
        ],
    },
    {
        id: "celestial", name: "Celestial Communion",
        items: ["ancient_halo", "celestial_robe", "featherfall", "star_amulet"],
        bonuses: [
            { need: 2, stats: { fortune: 10 } },
            { need: 4, stats: { crit_chance: 12, fortune: 18 } },
        ],
    },
    {
        id: "frost", name: "Frostbound",
        items: ["frost_brand", "frost_barrier", "frost_treads", "droplet_ring"],
        bonuses: [
            { need: 2, stats: { crit_chance: 6 } },
            { need: 4, stats: { crit_chance: 8, crit_power: 12 } },
        ],
    },
    {
        id: "undying", name: "The Undying",
        items: ["bone_mace", "cultist_hood", "bone_ring", "spectre_locket"],
        bonuses: [
            { need: 2, stats: { crit_power: 10 } },
            { need: 4, stats: { crit_chance: 10, crit_power: 20 } },
        ],
    },
];

const SET_BY_ITEM = {};
for (const set of ITEM_SETS) for (const id of set.items) SET_BY_ITEM[id] = set;

// The set an item belongs to (for display on item cards), or null.
export function setForItem(itemId) {
    return SET_BY_ITEM[itemId] || null;
}

// Count equipped pieces per set id from a list of equipped item ids.
function equippedCounts(equippedIds) {
    const counts = new Map();
    for (const id of equippedIds || []) {
        const set = SET_BY_ITEM[id];
        if (set) counts.set(set.id, (counts.get(set.id) || 0) + 1);
    }
    return counts;
}

// Total extra stats from all ACTIVE set-bonus tiers for the equipped loadout.
export function setBonusStats(equippedIds) {
    const counts = equippedCounts(equippedIds);
    const total = {};
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        for (const tier of set.bonuses) {
            if (n >= tier.need) {
                for (const [k, v] of Object.entries(tier.stats)) total[k] = (total[k] || 0) + v;
            }
        }
    }
    return total;
}

// A display view of every set the loadout touches: equipped count + each tier with an active flag.
export function activeSetBonuses(equippedIds) {
    const counts = equippedCounts(equippedIds);
    return ITEM_SETS
        .filter((set) => (counts.get(set.id) || 0) > 0)
        .map((set) => {
            const n = counts.get(set.id) || 0;
            return {
                id: set.id, name: set.name, equipped: n, total: set.items.length,
                tiers: set.bonuses.map((t) => ({ need: t.need, active: n >= t.need, stats: t.stats })),
            };
        });
}
