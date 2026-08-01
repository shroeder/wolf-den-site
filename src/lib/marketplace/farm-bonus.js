import "server-only";

import { db } from "@/lib/db";
import { BUFF_CAP, emptyFarmBuffs } from "@/lib/marketplace/decorations.js";
import { placedDecoBuffs } from "@/lib/marketplace/farm-decorations.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { sumItemFarm } from "@/lib/marketplace/items.js";
import { setFarmBonus } from "@/lib/marketplace/sets.js";
import { collectibleById, petFarmPassive } from "@/lib/marketplace/collectibles.js";
import { getBadgeFarm } from "@/lib/marketplace/badges.js";
import { getEquippedUtilTotals } from "@/lib/marketplace/item-affix.js";

// ── UNIFIED FARM BONUS AGGREGATOR ─────────────────────────────────────────────────────────────────────────
// The single source the farm reads for passive bonuses. Returns the SAME { growSpeed, seedLuck, harvestLuck,
// petXp, fertPower, goldHarvest } % shape as decorationBuffs, but summed from THREE sources:
//   (a) PLACED DECORATIONS   — placedDecoBuffs (existing behaviour, unchanged)
//   (b) EQUIPPED GEAR        — the `farm` affix block on equipped items (items.js sumItemFarm)
//   (c) EQUIPPED PET         — the pastoral pet's farm passive (collectibles.js petFarmPassive)
// The per-stat BUFF_CAP (shared with decorations) is applied to the COMBINED total, so gear + pet can't blow
// past the ceiling decorations already respect. Gear farm affixes and pet farm passives are quarantined from
// boss combat (they live outside item `stats` / the pet combat aggregator), so this only ever feeds farming.
export async function farmBonuses(buyerId) {
    const out = emptyFarmBuffs();
    if (!buyerId) return out;
    const [deco, bySlot, buyer, badgeFarm, utilTotals] = await Promise.all([
        placedDecoBuffs(buyerId).catch(() => emptyFarmBuffs()),
        getEquippedIds(buyerId).catch(() => ({})),
        db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getBadgeFarm(buyerId).catch(() => ({})), // (d) earned FARMING/pet badges add farm bonuses too
        getEquippedUtilTotals(buyerId).catch(() => ({ farm: {} })), // (e) rare Forge "attunement" farm affixes on equipped gear
    ]);
    const equippedList = Object.values(bySlot || {});
    const gearFarm = sumItemFarm(equippedList);
    // (b2) FARM set-bonus tiers (Harvester / Forager) — small farm affinity on top of the pieces' own affixes.
    const setFarm = setFarmBonus(equippedList);
    const utilFarm = utilTotals.farm || {};
    // (a) decorations + (b) equipped gear farm affixes + (b2) farm set bonuses + (d) farm/pet badges + (e) forge attunements
    for (const k of Object.keys(out)) out[k] = (deco[k] || 0) + (gearFarm[k] || 0) + (setFarm[k] || 0) + (badgeFarm[k] || 0) + (utilFarm[k] || 0);
    // (c) equipped pet farm passive (pastoral pets only) — value by rarity
    const pet = buyer?.featured_collectible ? collectibleById(buyer.featured_collectible) : null;
    const petFarm = petFarmPassive(pet);
    // (f) THE WHOLE MENAGERIE — every owned pastoral pet, not just the one you have out. These stats sat in
    // PET_PASSIVE_STAT (the "passive" map) but the only reader was this function, which looks at the equipped
    // pet alone — so owning sixteen pastoral pets did nothing. Capped in combinePetBonuses, then folded in
    // here under the same BUFF_CAP as everything else.
    let ownedFarm = {};
    try {
        const { getPetCombatBonus } = await import("@/lib/marketplace/pet-combat.js");
        ownedFarm = (await getPetCombatBonus(buyerId))?.system || {};
    } catch { ownedFarm = {}; }
    for (const k of ["seedLuck", "growSpeed", "petXp"]) {
        if (ownedFarm[k]) out[k] = (out[k] || 0) + ownedFarm[k];
    }
    if (petFarm && out[petFarm.stat] != null) out[petFarm.stat] += petFarm.value;
    // Cap the combined total per stat (same ceiling decorations already enforce).
    for (const k of Object.keys(out)) out[k] = Math.min(BUFF_CAP[k], out[k]);
    return out;
}
