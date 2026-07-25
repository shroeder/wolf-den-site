import "server-only";

import { db } from "@/lib/db";
import { BUFF_CAP, emptyFarmBuffs } from "@/lib/marketplace/decorations.js";
import { placedDecoBuffs } from "@/lib/marketplace/farm-decorations.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { sumItemFarm } from "@/lib/marketplace/items.js";
import { collectibleById, petFarmPassive } from "@/lib/marketplace/collectibles.js";

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
    const [deco, bySlot, buyer] = await Promise.all([
        placedDecoBuffs(buyerId).catch(() => emptyFarmBuffs()),
        getEquippedIds(buyerId).catch(() => ({})),
        db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const gearFarm = sumItemFarm(Object.values(bySlot || {}));
    // (a) decorations + (b) equipped gear farm affixes
    for (const k of Object.keys(out)) out[k] = (deco[k] || 0) + (gearFarm[k] || 0);
    // (c) equipped pet farm passive (pastoral pets only) — value by rarity
    const pet = buyer?.featured_collectible ? collectibleById(buyer.featured_collectible) : null;
    const petFarm = petFarmPassive(pet);
    if (petFarm && out[petFarm.stat] != null) out[petFarm.stat] += petFarm.value;
    // Cap the combined total per stat (same ceiling decorations already enforce).
    for (const k of Object.keys(out)) out[k] = Math.min(BUFF_CAP[k], out[k]);
    return out;
}
