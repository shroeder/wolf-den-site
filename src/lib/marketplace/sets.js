import "server-only";

import { itemById, describeStats, describeSea, describeFarm, describeDepth } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";

// EVERY SET NEEDS ITS OWN IDENTITY AT 2 PIECES.
// The capstones were always distinct — crit bonus, erupt, execute, extra strike, pack damage. The TIERS were
// not: eight combat sets all read "+N% of one of the same five stats", and Wildstalker and Frostbound had
// bonuses that were character-for-character IDENTICAL ({crit_chance:6} then {crit_chance:8, crit_power:12}),
// so two different chases paid exactly the same thing. Nothing in the UI could tell them apart above the name.
//
// Each combat set now owns ONE stat at 2 pieces — the line you read first is the set's whole personality:
//   Warlord    MIGHT      Dragonlord FEROCITY   Voidbound  FORTUNE     Wildstalker CRIT CHANCE (how often)
//   Titanforged MIGHT+vol Celestial  FORTUNE    Frostbound CRIT POWER (how hard)  Undying FEROCITY (attrition)
// 4-piece stat BUDGETS are held at their old totals (ranger 20, frost 20, undying 30) so nobody's damage moves
// — this is a redistribution for legibility, not a buff.
//
// Themed gear SETS. Equip N matching pieces to unlock tiered stat bonuses (extra stats on top of the items),
// and a FULL set unlocks a CAPSTONE proc (a signature-style effect). Each set also has a WEAKNESS AFFINITY:
// when this week's boss is weak to that playstyle, an active set deals bonus damage — so the "best" set to
// wear rotates with the boss. Stat bonuses flow through the normal pipeline (no combat code); capstones +
// synergy are applied per-hit by setCombatMult (see boss.js). Sets span slots so a full bonus is achievable.

// ── TWO KINDS OF SET ─────────────────────────────────────────────────────────────────────────────────────────
// COMBAT sets are gear: their bonus is the reward for WEARING the pieces together, and choosing that loadout
// over another is the decision. They count equipped pieces, as they always have.
//
// COLLECTION sets (`collection: true` — the farm, mine, wheel and sailing ones) count what you OWN. Their
// bonuses go to activities you do with your hands, not to a fight, and tying them to your loadout meant
// keeping a "crafting kit" and a "fighting kit" and swapping between them all day. That is not a build
// decision, it is bookkeeping with an inventory screen attached — and the piece you had to take off to go
// farming was usually the piece that made you good at fighting.
//
// So a collection piece is a TROPHY: obtaining it ticks its slot permanently and its bonus is simply on. The
// chase, the tiers and the capstone are all unchanged — only the question changes, from "am I wearing this?"
// to "did I ever find it?". They are still real items you can equip if you want their combat stats; equipping
// one just does not decide whether its collection bonus applies.
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
        bonuses: [{ need: 2, stats: { crit_chance: 8 } }, { need: 4, stats: { crit_chance: 14, might: 6 } }],
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
        bonuses: [{ need: 2, stats: { crit_power: 10 } }, { need: 4, stats: { crit_power: 20 } }],
        capstone: { erupt: { chance: 0.25, mult: 3 }, desc: "Full set: 25% chance on each strike to SHATTER for ×3." },
        weakness: "unstable",
    },
    {
        id: "undying", name: "The Undying",
        items: ["bone_mace", "cultist_hood", "bone_ring", "spectre_locket"],
        bonuses: [{ need: 2, stats: { ferocity: 10 } }, { need: 4, stats: { ferocity: 14, crit_power: 16 } }],
        capstone: { execute: 0.5, desc: "Full set: +50% damage while the boss is under 25% HP." },
        weakness: "frail",
    },
    {
        // The aspirational SAILING set — bonuses are SEA affinity (raids/digging/voyages), NOT boss power, and the
        // capstone is a build-defining raid boon. Pieces are scattered sea-themed gear (a real collect-them-all chase).
        id: "corsair", collection: true, feature: "sea", name: "Dread Corsair's Regalia",
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
        id: "harvester", collection: true, feature: "farm", name: "Harvester's Garb",
        items: ["harvesters_hat", "reapers_girdle", "sheafbound_cloak", "amber_grain_pendant"],
        bonuses: [{ need: 2, farm: { harvestLuck: 4 } }, { need: 4, farm: { harvestLuck: 6, goldHarvest: 8 } }],
        capstone: { farmDoubleYield: 0.2, desc: "Bountiful Reaping: each harvest has a 20% chance to yield DOUBLE gold." },
        weakness: null,
    },
    {
        id: "forager", collection: true, feature: "farm", name: "Forager's Kit",
        items: ["foragers_basket", "clover_signet", "deep_seed_pouch", "foxglove_charm"],
        bonuses: [{ need: 2, farm: { seedLuck: 5 } }, { need: 4, farm: { seedLuck: 7, growSpeed: 5 } }],
        capstone: { farmGrow: 0.15, desc: "Green Season: your crops grow 15% faster." },
        weakness: null,
    },
    {
        // ── WHEEL SET ── the wheel-exclusive gear from the Prize Wheel's match-3 BONUS GAME, made a collect-them-all
        // set whose bonuses feed the WHEEL itself (Lucky Spin proc gold + a free-respin capstone), read in
        // spin.js — NOT boss power. `full` = 8 because two pieces share the main_hand slot (blade + axe), so all ten
        // can never be worn at once; the capstone unlocks at 8 equipped.
        id: "wheelwarden", collection: true, feature: "wheel", name: "Wheelwarden's Fortune",
        items: ["wg_helm", "wg_shield", "wg_ring", "wg_cloak", "wg_amulet", "wg_blade", "wg_chest", "wg_belt", "wg_boots", "wg_axe"],
        full: 8,
        // `luck` = % CHANCE per spin to trigger a Lucky Spin (bonus gold on gold prizes), NOT a guaranteed
        // every-spin bonus — kept as a proc so the set is a fun edge, not an auto-win.
        bonuses: [
            { need: 2, wheel: { luck: 10 } },
            { need: 4, wheel: { luck: 10 } },
            { need: 6, wheel: { luck: 12 } },
        ],
        capstone: { wheelRespin: 0.12, desc: "Lucky Streak: a 12% chance each spin is FREE — your spin is refunded." },
        weakness: null,
    },
    // ── DEPTHS SETS ── one per verb the Mine asks of you. Bonuses are DEPTH affinity (see items.js DEPTH_META),
    // never boss power, and the capstones are mine-only powers read in mining.js.
    {
        id: "delver", collection: true, feature: "depths", name: "Delver's Kit",
        items: ["dv_lamp_helm", "dv_rope_belt", "dv_lodestone", "dv_shoring_pack"],
        bonuses: [{ need: 2, depth: { nerve: 3 } }, { need: 4, depth: { nerve: 5, lodesense: 4 } }],
        // The push-your-luck loop's dream: one free mistake. You still collapse — you just walk away with the
        // haul the one time it matters most, which is the difference between pushing to depth 12 and not.
        capstone: { depthSecondWind: true, desc: "Second Wind: the first collapse of each day leaves your haul intact." },
        weakness: null,
    },
    {
        id: "rockbreaker", collection: true, feature: "depths", name: "Rockbreaker's Rig",
        items: ["rb_maul", "rb_gauntlet", "rb_assay_ring", "rb_hobnails"],
        bonuses: [{ need: 2, depth: { hew: 4 } }, { need: 4, depth: { hew: 6, prospect: 4 } }],
        capstone: { depthRichSeam: 0.15, desc: "Rich Seam: a 15% chance a cracked seam pays its ore TWICE." },
        weakness: null,
    },
    {
        id: "founder", collection: true, feature: "depths", name: "Founder's Regalia",
        items: ["fd_apron", "fd_tongs", "fd_bellows_charm", "fd_slagsifter"],
        bonuses: [{ need: 2, depth: { bellows: 4 } }, { need: 4, depth: { bellows: 5, crucible: 5 } }],
        capstone: { depthFreeSmelt: 0.18, desc: "Cold Crucible: an 18% chance a smelt costs you no ore at all." },
        weakness: null,
    },
];

// How many equipped pieces a set's CAPSTONE needs (defaults to all items; `full` overrides when some pieces
// share a slot and the whole set can't be worn at once — e.g. the wheel set's two main-hand pieces).
const fullNeed = (set) => set.full || set.items.length;

const SET_BY_ID = Object.fromEntries(ITEM_SETS.map((s) => [s.id, s]));
const SET_BY_ITEM = {};
for (const set of ITEM_SETS) for (const id of set.items) SET_BY_ITEM[id] = set;

// Sets belonging to a feature that hasn't launched carry `ownerOnly: true`. Same contract as pets and items:
// invisible in the browser, but fully functional for whoever actually holds the pieces (the bonus maths below
// walks ITEM_SETS unfiltered on purpose — an owner testing the feature should get the real set bonus).
export const PUBLIC_ITEM_SETS = ITEM_SETS.filter((s) => !s.ownerOnly);

// The collections belonging to one feature, in the shape the shared panel renders. Called by the farm, the
// mine, sailing and the wheel so each screen can show its own chase permanently — the pieces, what each one
// gives, the tiers and the capstone — the way the Forge already shows its parts.
export function collectionsForFeature(feature, ownedIds) {
    const own = ownedIds || [];
    return getSetsOverview([], own).filter((s) => s.collection && SET_BY_ID[s.id]?.feature === feature);
}

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

// Collection sets count OWNED pieces, so every reader of a collection bonus is handed the owned list instead
// of the loadout. Duplicates cannot inflate a set — a piece you hold twice is still one slot ticked off.
export function collectedCounts(ownedIds) {
    const list = Array.isArray(ownedIds) ? ownedIds : Object.values(ownedIds || {});
    const seen = new Set();
    const counts = new Map();
    for (const id of list) {
        if (seen.has(id)) continue;
        seen.add(id);
        const set = SET_BY_ITEM[id];
        if (set?.collection) counts.set(set.id, (counts.get(set.id) || 0) + 1);
    }
    return counts;
}
export const COLLECTION_SETS = ITEM_SETS.filter((s) => s.collection);

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
export function setSeaBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
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
export function setRaidBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
    let n = 0;
    for (const set of ITEM_SETS) if (set.capstone?.bonusRaids && (counts.get(set.id) || 0) >= set.items.length) n += set.capstone.bonusRaids;
    return n;
}
// Does a full-set capstone DOUBLE raid-win gold?
export function setDoublesRaidGold(ownedIds) {
    const counts = collectedCounts(ownedIds);
    for (const set of ITEM_SETS) if (set.capstone?.doubleRaidGold && (counts.get(set.id) || 0) >= set.items.length) return true;
    return false;
}

// Aggregate FARM affinity granted by active set-bonus tiers (read by the farm-bonus aggregator — never boss).
// Mirrors setSeaBonus: only tier `farm` blocks contribute (capstones are handled by the readers below).
export function setFarmBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
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
export function setFarmGrowBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
    let frac = 0;
    for (const set of ITEM_SETS) if (set.capstone?.farmGrow && (counts.get(set.id) || 0) >= set.items.length) frac += set.capstone.farmGrow;
    return Math.min(0.5, frac);
}
// Full-set FARM capstone: chance a harvest yields DOUBLE gold (Harvester 0.20). Consumed in farm-crops.js harvestPlot.
export function setFarmDoubleHarvest(ownedIds) {
    const counts = collectedCounts(ownedIds);
    let chance = 0;
    for (const set of ITEM_SETS) if (set.capstone?.farmDoubleYield && (counts.get(set.id) || 0) >= set.items.length) chance += set.capstone.farmDoubleYield;
    return Math.min(0.75, chance);
}

// ── DEPTHS ── aggregate DEPTH affinity granted by active set tiers + capstones (read by mining.js, never boss).
export function setDepthBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
    const total = {};
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        for (const tier of set.bonuses) {
            if (n >= tier.need && tier.depth) for (const [k, v] of Object.entries(tier.depth)) total[k] = (total[k] || 0) + v;
        }
        if (set.capstone?.depth && n >= fullNeed(set)) for (const [k, v] of Object.entries(set.capstone.depth)) total[k] = (total[k] || 0) + v;
    }
    return total;
}
// The three DEPTHS capstones, each consumed at a different point in mining.js:
//   Delver     — the day's first collapse leaves your haul intact (goDeeper)
//   Rockbreaker— a chance a cracked seam pays its ore twice (crack)
//   Founder    — a chance a smelt costs no ore at all (smeltOre)
export function setDepthCapstones(ownedIds) {
    const counts = collectedCounts(ownedIds);
    let secondWind = false, richSeam = 0, freeSmelt = 0;
    for (const set of ITEM_SETS) {
        if ((counts.get(set.id) || 0) < fullNeed(set)) continue;
        if (set.capstone?.depthSecondWind) secondWind = true;
        if (set.capstone?.depthRichSeam) richSeam += set.capstone.depthRichSeam;
        if (set.capstone?.depthFreeSmelt) freeSmelt += set.capstone.depthFreeSmelt;
    }
    return { secondWind, richSeam: Math.min(0.5, richSeam), freeSmelt: Math.min(0.5, freeSmelt) };
}

// Aggregate WHEEL bonuses granted by active set-bonus tiers (read by spin.js — never boss). `luck` = % chance
// per spin to trigger a Lucky Spin (bonus gold on gold prizes). It's a proc, not a
// guaranteed per-spin bonus.
export function setWheelBonus(ownedIds) {
    const counts = collectedCounts(ownedIds);
    const total = { luck: 0 };
    for (const set of ITEM_SETS) {
        const n = counts.get(set.id) || 0;
        for (const tier of set.bonuses) {
            if (n >= tier.need && tier.wheel) for (const [k, v] of Object.entries(tier.wheel)) total[k] = (total[k] || 0) + v;
        }
    }
    return total;
}
// Full-set WHEEL capstone: chance a spin is refunded (free re-spin). Consumed in spin.js doSpin.
export function setWheelRespinChance(ownedIds) {
    const counts = collectedCounts(ownedIds);
    let chance = 0;
    for (const set of ITEM_SETS) if (set.capstone?.wheelRespin && (counts.get(set.id) || 0) >= fullNeed(set)) chance += set.capstone.wheelRespin;
    return Math.min(0.5, chance);
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
                tiers: set.bonuses.map((t) => ({ need: t.need, active: n >= t.need, stats: t.stats, sea: t.sea, farm: t.farm, wheel: t.wheel })),
                capstone: set.capstone ? { desc: set.capstone.desc, active: n >= fullNeed(set) } : null,
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
    // The browser shows PUBLIC sets, plus any unlaunched one you already hold a piece of — so an owner testing
    // a feature still sees their set, and nobody else sees a set they have no way to explain.
    const visible = ITEM_SETS.filter((s) => !s.ownerOnly || s.items.some((id) => own.has(id) || eq.has(id)));
    return visible.map((set) => {
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
                // WHAT THIS ONE PIECE GIVES YOU, on its own. A collection panel that lists the set's tiers but
                // not the slots' own bonuses is only telling you half of what you collected — and for the farm
                // and mine pieces the affix IS the reason to want it.
                utilText: [
                    it?.sea ? describeSea(it.sea) : "",
                    it?.farm ? describeFarm(it.farm) : "",
                    it?.depth ? describeDepth(it.depth) : "",
                ].filter(Boolean).join(" · ") || "",
                signature: sig ? `${sig.label}: ${sig.desc}` : null,
                flavor: it?.flavor || null,
                owned: own.has(id),
                equipped: eq.has(id),
            };
        });
        const equipped = pieces.filter((p) => p.equipped).length;
        const owned = pieces.filter((p) => p.owned).length;
        // What makes a tier LIVE: worn pieces for a combat set, collected pieces for a collection. Reading the
        // wrong one here is how a screen ends up telling somebody their farm bonus is off while the farm is
        // busy applying it.
        const have = set.collection ? owned : equipped;
        return {
            id: set.id, name: set.name, total: set.items.length, equipped, owned,
            collection: Boolean(set.collection), // drives "collected 3/4" wording instead of "3/4 worn"
            have,
            weakness: set.weakness || null,
            pieces,
            tiers: set.bonuses.map((t) => ({ need: t.need, active: have >= t.need, stats: t.stats || null, sea: t.sea || null, farm: t.farm || null, wheel: t.wheel || null, depth: t.depth || null })),
            capstone: set.capstone ? { desc: set.capstone.desc, active: have >= fullNeed(set) } : null,
        };
    });
}
