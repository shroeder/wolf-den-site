import "server-only";

import { itemById, describeStats } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";

// Themed gear SETS. Equip N matching pieces to unlock tiered stat bonuses (extra stats on top of the items),
// and a FULL set unlocks a CAPSTONE proc (a signature-style effect). Each set also has a WEAKNESS AFFINITY:
// when this week's boss is weak to that playstyle, an active set deals bonus damage — so the "best" set to
// wear rotates with the boss. Stat bonuses flow through the normal pipeline (no combat code); capstones +
// synergy are applied per-hit by setCombatMult (see boss.js). Sets span slots so a full bonus is achievable.

const GIANT_HP = 5_000_000;

export const ITEM_SETS = [
    {
        id: "warlord", name: "Warlord's Regalia",
        items: ["executioner_axe", "centurion_helm", "warlord_plate", "war_girdle", "warlord_ring"],
        bonuses: [{ need: 2, stats: { might: 8 } }, { need: 4, stats: { might: 12, crit_power: 12 } }],
        capstone: { crit_bonus: 0.5, desc: "Full set: your CRITICAL hits deal +50%." },
        weakness: "exposed",
    },
    {
        id: "dragon", name: "Dragonlord's Aspect",
        items: ["dragonfang_blade", "dragon_shield", "dragonplate", "dragoncape", "dragonheart_sigil"],
        bonuses: [{ need: 2, stats: { ferocity: 8 } }, { need: 4, stats: { might: 12, ferocity: 12 } }],
        capstone: { erupt: { chance: 0.25, mult: 2 }, desc: "Full set: 25% chance on each hit to ERUPT for double." },
        weakness: "unstable",
    },
    {
        id: "void", name: "Voidbound",
        items: ["void_maelstrom", "voidwalkers", "eternity_band", "galaxy_pendant", "cosmic_sash"],
        bonuses: [{ need: 2, stats: { fortune: 10 } }, { need: 4, stats: { ferocity: 14, fortune: 14 } }],
        capstone: { giant: 0.5, desc: "Full set: +50% damage against colossal (high-HP) bosses." },
        weakness: null,
    },
    {
        id: "ranger", name: "Wildstalker's Kit",
        items: ["hunters_bow", "rangers_hood", "swift_boots", "focus_band"],
        bonuses: [{ need: 2, stats: { crit_chance: 6 } }, { need: 4, stats: { crit_chance: 8, crit_power: 12 } }],
        capstone: { first_double: true, desc: "Full set: your FIRST strike each day deals DOUBLE." },
        weakness: "sluggish",
    },
    {
        id: "titan", name: "Titanforged",
        items: ["worldflame_maul", "starforged_mail", "colossus_belt", "kings_eternal"],
        bonuses: [{ need: 2, stats: { might: 10 } }, { need: 4, stats: { might: 16, extra_strike: 1 } }],
        capstone: { strikes: 1, desc: "Full set: +1 boss attack every day." },
        weakness: null,
    },
    {
        id: "celestial", name: "Celestial Communion",
        items: ["ancient_halo", "celestial_robe", "featherfall", "star_amulet"],
        bonuses: [{ need: 2, stats: { fortune: 10 } }, { need: 4, stats: { crit_chance: 12, fortune: 18 } }],
        capstone: { pack: true, desc: "Full set: +3% damage per ally who attacked today (up to +25%)." },
        weakness: "hunted",
    },
    {
        id: "frost", name: "Frostbound",
        items: ["frost_brand", "frost_barrier", "frost_treads", "droplet_ring"],
        bonuses: [{ need: 2, stats: { crit_chance: 6 } }, { need: 4, stats: { crit_chance: 8, crit_power: 12 } }],
        capstone: { overcharge: { every: 5, mult: 3 }, desc: "Full set: every 5th hit deals ×3." },
        weakness: "unstable",
    },
    {
        id: "undying", name: "The Undying",
        items: ["bone_mace", "cultist_hood", "bone_ring", "spectre_locket"],
        bonuses: [{ need: 2, stats: { crit_power: 10 } }, { need: 4, stats: { crit_chance: 10, crit_power: 20 } }],
        capstone: { execute: 0.5, desc: "Full set: +50% damage while the boss is under 25% HP." },
        weakness: "frail",
    },
    {
        // The aspirational SAILING set — bonuses are SEA affinity (raids/digging/voyages), NOT boss power, and the
        // capstone is a build-defining raid boon. Pieces are scattered sea-themed gear (a real collect-them-all chase).
        id: "corsair", name: "Dread Corsair's Regalia",
        items: ["heavens_trident", "orb_of_tides", "girded_plate", "merchants_cape", "fortune_signet"],
        bonuses: [{ need: 2, sea: { plunder: 4 } }, { need: 4, sea: { broadside: 6, ironclad: 6 } }],
        capstone: { bonusRaids: 1, doubleRaidGold: true, sea: { plunder: 6, bounty: 6 },
            desc: "The Dread Pirate: +1 raid every day, raid wins pay DOUBLE gold, and a surge of Plunder & Bounty." },
        weakness: null,
    },
    // ── FARM SETS ── bonuses are FARM affinity (seedLuck/growSpeed/harvestLuck/goldHarvest), NOT boss power, and
    // capstones are farm powers read+applied in farm-crops.js (setFarmGrowBonus / setFarmDoubleHarvest). Pieces
    // are utility-slot gear (helmet/belt/back/amulet/off_hand/ring) with FARM affixes — see items.js.
    {
        id: "harvester", name: "Harvester's Garb",
        items: ["harvesters_hat", "reapers_girdle", "sheafbound_cloak", "amber_grain_pendant"],
        bonuses: [{ need: 2, farm: { harvestLuck: 4 } }, { need: 4, farm: { harvestLuck: 6, goldHarvest: 8 } }],
        capstone: { farmDoubleYield: 0.2, desc: "Bountiful Reaping: each harvest has a 20% chance to yield DOUBLE gold." },
        weakness: null,
    },
    {
        id: "forager", name: "Forager's Kit",
        items: ["foragers_basket", "clover_signet", "deep_seed_pouch", "foxglove_charm"],
        bonuses: [{ need: 2, farm: { seedLuck: 5 } }, { need: 4, farm: { seedLuck: 7, growSpeed: 5 } }],
        capstone: { farmGrow: 0.15, desc: "Green Season: your crops grow 15% faster." },
        weakness: null,
    },
];

const SET_BY_ITEM = {};
for (const set of ITEM_SETS) for (const id of set.items) SET_BY_ITEM[id] = set;

// The set an item belongs to (for display on item cards), or null.
export function setForItem(itemId) {
    return SET_BY_ITEM[itemId] || null;
}

// Set names that synergize with a given boss weakness (for the boss page hint).
export function setsForWeakness(key) {
    return key ? ITEM_SETS.filter((s) => s.weakness === key).map((s) => s.name) : [];
}

// Count equipped pieces per set id. Accepts either an array of item ids OR the {slot → item_id} object
// that getEquippedIds() returns (matching signatures.js's `ids()` normalizer) — passing the object bare
// to `for…of` threw "not iterable", which broke setCombatMult/setCapstoneStrikeBonus in the attack path.
function equippedCounts(equippedIds) {
    const list = Array.isArray(equippedIds) ? equippedIds : Object.values(equippedIds || {});
    const counts = new Map();
    for (const id of list) {
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
            if (n >= tier.need && tier.stats) for (const [k, v] of Object.entries(tier.stats)) total[k] = (total[k] || 0) + v;
        }
    }
    return total;
}

// Aggregate SEA affinity granted by active set-bonus tiers + full-set capstones (read by sailing.js — never boss).
export function setSeaBonus(equippedIds) {
    const counts = equippedCounts(equippedIds);
    const total = {};
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        for (const tier of set.bonuses) {
            if (n >= tier.need && tier.sea) for (const [k, v] of Object.entries(tier.sea)) total[k] = (total[k] || 0) + v;
        }
        if (set.capstone?.sea && n >= set.items.length) for (const [k, v] of Object.entries(set.capstone.sea)) total[k] = (total[k] || 0) + v;
    }
    return total;
}
// Extra daily RAIDS from full-set capstones (Dread Corsair +1).
export function setRaidBonus(equippedIds) {
    const counts = equippedCounts(equippedIds);
    let n = 0;
    for (const set of ITEM_SETS) if (set.capstone?.bonusRaids && (counts.get(set.id) || 0) >= set.items.length) n += set.capstone.bonusRaids;
    return n;
}
// Does a full-set capstone DOUBLE raid-win gold?
export function setDoublesRaidGold(equippedIds) {
    const counts = equippedCounts(equippedIds);
    for (const set of ITEM_SETS) if (set.capstone?.doubleRaidGold && (counts.get(set.id) || 0) >= set.items.length) return true;
    return false;
}

// Aggregate FARM affinity granted by active set-bonus tiers (read by the farm-bonus aggregator — never boss).
// Mirrors setSeaBonus: only tier `farm` blocks contribute (capstones are handled by the readers below).
export function setFarmBonus(equippedIds) {
    const counts = equippedCounts(equippedIds);
    const total = {};
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        for (const tier of set.bonuses) {
            if (n >= tier.need && tier.farm) for (const [k, v] of Object.entries(tier.farm)) total[k] = (total[k] || 0) + v;
        }
    }
    return total;
}
// Full-set FARM capstone: total crop grow-speed fraction (Forager 0.15). Consumed in farm-crops.js plantSeed.
export function setFarmGrowBonus(equippedIds) {
    const counts = equippedCounts(equippedIds);
    let frac = 0;
    for (const set of ITEM_SETS) if (set.capstone?.farmGrow && (counts.get(set.id) || 0) >= set.items.length) frac += set.capstone.farmGrow;
    return Math.min(0.5, frac);
}
// Full-set FARM capstone: chance a harvest yields DOUBLE gold (Harvester 0.20). Consumed in farm-crops.js harvestPlot.
export function setFarmDoubleHarvest(equippedIds) {
    const counts = equippedCounts(equippedIds);
    let chance = 0;
    for (const set of ITEM_SETS) if (set.capstone?.farmDoubleYield && (counts.get(set.id) || 0) >= set.items.length) chance += set.capstone.farmDoubleYield;
    return Math.min(0.75, chance);
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
                tiers: set.bonuses.map((t) => ({ need: t.need, active: n >= t.need, stats: t.stats, sea: t.sea, farm: t.farm })),
                capstone: set.capstone ? { desc: set.capstone.desc, active: n >= set.items.length } : null,
            };
        });
}

// Extra daily strikes from FULL-set capstones.
export function setCapstoneStrikeBonus(equippedIds) {
    const counts = equippedCounts(equippedIds);
    let n = 0;
    for (const set of ITEM_SETS) if (set.capstone?.strikes && (counts.get(set.id) || 0) >= set.items.length) n += set.capstone.strikes;
    return n;
}

// Per-hit damage multiplier from set CAPSTONES (full set) + WEAKNESS SYNERGY (affinity matches the boss's
// weakness while the set is active). Bounded so it stacks reasonably with signatures/pets.
export function setCombatMult(equippedIds, ctx = {}) {
    const { crit = false, hitIndex = 0, bossHpFrac = 1, bossMaxHp = 0, hittersToday = 1, bossWeakness = null, rand = Math.random } = ctx;
    const counts = equippedCounts(equippedIds);
    let mult = 1;
    const fired = [];
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        if (n <= 0) continue;
        // Weakness synergy: the set is active (≥ its first tier) AND its affinity matches this week's boss.
        if (set.weakness && set.weakness === bossWeakness && n >= (set.bonuses[0]?.need || 2)) { mult *= 1.25; fired.push(`${set.name} SYNERGY`); }
        // Capstone (full set only).
        if (n >= set.items.length && set.capstone) {
            const c = set.capstone;
            if (c.crit_bonus && crit) { mult *= 1 + c.crit_bonus; fired.push(set.name); }
            if (c.erupt && rand() < c.erupt.chance) { mult *= c.erupt.mult; fired.push(`${set.name} ERUPTS`); }
            if (c.execute && bossHpFrac <= 0.25) { mult *= 1 + c.execute; fired.push(`${set.name} — EXECUTE`); }
            if (c.giant && bossMaxHp >= GIANT_HP) { mult *= 1 + c.giant; fired.push(set.name); }
            if (c.overcharge && (hitIndex + 1) % c.overcharge.every === 0) { mult *= c.overcharge.mult; fired.push(`${set.name} OVERCHARGE`); }
            if (c.first_double && hitIndex === 0) { mult *= 2; fired.push(set.name); }
            if (c.pack) { const b = Math.min(0.25, 0.03 * Math.max(0, hittersToday - 1)); if (b > 0) { mult *= 1 + b; fired.push(set.name); } }
        }
    }
    return { mult: Math.min(mult, 4), proc: fired[0] || null };
}

// Full overview for the Sets browser: every set with per-piece owned/equipped status + bonuses + capstone.
export function getSetsOverview(equippedIds, ownedIds) {
    const eq = new Set(equippedIds || []);
    const own = new Set(ownedIds || []);
    return ITEM_SETS.map((set) => {
        const pieces = set.items.map((id) => {
            const it = itemById(id);
            const sig = signatureFor(id);
            return {
                id,
                name: it?.name || id,
                rarity: it?.rarity || null,
                slot: it?.slot || null,
                icon: it?.icon || null,
                statsText: describeStats(it?.stats) || "",
                signature: sig ? `${sig.label}: ${sig.desc}` : null,
                flavor: it?.flavor || null,
                owned: own.has(id),
                equipped: eq.has(id),
            };
        });
        const equipped = pieces.filter((p) => p.equipped).length;
        const owned = pieces.filter((p) => p.owned).length;
        return {
            id: set.id, name: set.name, total: set.items.length, equipped, owned,
            weakness: set.weakness || null,
            pieces,
            tiers: set.bonuses.map((t) => ({ need: t.need, active: equipped >= t.need, stats: t.stats || null, sea: t.sea || null, farm: t.farm || null })),
            capstone: set.capstone ? { desc: set.capstone.desc, active: equipped >= set.items.length } : null,
        };
    });
}
