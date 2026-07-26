import "server-only";

import { db } from "@/lib/db";
import { SEEDS, seedById, grantSeed } from "@/lib/marketplace/farm-crops.js";

// Effect-application helpers for the non-combat ACTIVITY consumables (farming / petting / liking). Kept in
// their own module so consumables.js can call them WITHOUT importing farm-crops.js / farm.js / farm-rating.js
// directly (those already import consumables.js — a direct back-import would make a cycle). This module only
// reads SEEDS from farm-crops.js (one-way) and does self-contained DB writes, so there's no import loop.
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, matches the rest of the game

const seedsOfRarity = (r) => Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === r);
function weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) < 0) return k; }
    return Object.keys(weights)[0];
}

// Growth Tonic — greatly speed the ONE growing crop with the most time left (the most impactful target, so no
// picker is needed). Removes `cut` of that crop's remaining grow time. Returns the crop's name, or null if
// nothing is growing (so the caller can refuse to spend the item).
export async function applyGrowthTonic(buyerId, cut = 0.6) {
    const frac = Math.max(0, Math.min(0.95, Number(cut) || 0));
    const row = await db.queryOne(
        `UPDATE mkt_farm_plot
            SET ready_at = NOW() + (GREATEST(0, EXTRACT(EPOCH FROM (ready_at - NOW())) * $2) || ' seconds')::interval
          WHERE buyer_id = $1
            AND slot = (SELECT slot FROM mkt_farm_plot WHERE buyer_id = $1 AND ready_at > NOW() ORDER BY ready_at DESC LIMIT 1)
            AND ready_at > NOW()
          RETURNING seed_id`,
        [buyerId, 1 - frac]
    ).catch(() => null);
    if (!row) return null;
    const def = seedById(row.seed_id);
    return { seedId: row.seed_id, name: def?.name || "your crop", emoji: def?.emoji || "🌱" };
}

// Seed pack — grant `n` random seeds using the pack tier's rarity `weights` (basic packs skew common/rare;
// pricier crate/vault tiers unlock epic/legendary/mythic). Falls back to the modest basic mix when no weights
// are given. Returns a { name, emoji, count } tally for the toast.
export async function grantSeedBundle(buyerId, n = 3, weights = null) {
    const count = Math.max(1, Math.min(10, Number(n) || 1));
    const mix = weights && typeof weights === "object" && Object.keys(weights).length ? weights : { common: 78, rare: 20, epic: 2 };
    const tally = new Map();
    for (let i = 0; i < count; i += 1) {
        let rarity = weightedPick(mix);
        let pool = seedsOfRarity(rarity);
        // Guard: if a tier's rolled rarity has no crops defined, fall back to any common seed rather than nothing.
        if (!pool.length) { rarity = "common"; pool = seedsOfRarity("common"); }
        const sid = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
        await grantSeed(buyerId, sid).catch(() => {});
        tally.set(sid, (tally.get(sid) || 0) + 1);
    }
    const got = [...tally.entries()].map(([sid, c]) => { const d = seedById(sid); return { id: sid, name: d?.name || sid, emoji: d?.emoji || "🌱", count: c }; });
    return { count, got };
}

// Fertilizer Crate — top up the member's fertilizer stock by `n`.
export async function grantFarmFertilizer(buyerId, n = 5) {
    const count = Math.max(1, Math.min(20, Number(n) || 1));
    await db.query(`UPDATE mkt_buyer SET farm_fertilizer = COALESCE(farm_fertilizer,0) + $2 WHERE id = $1`, [buyerId, count]).catch(() => {});
    return { count };
}

// Harvest Charm — bank `n` harvest-luck charges. Each pending charge nudges a harvest's loot-tier promote
// chance up (consumed one-per-harvest in harvestPlot). A use-count, never a daily reset.
export async function grantHarvestLuckCharges(buyerId, n = 5) {
    const count = Math.max(1, Math.min(50, Number(n) || 1));
    await db.query(`UPDATE mkt_buyer SET farm_harvest_luck = COALESCE(farm_harvest_luck,0) + $2 WHERE id = $1`, [buyerId, count]).catch(() => {});
    return { count };
}

// Pettin' Whistle — grant `n` EXTRA own-pet pettings for TODAY (on top of the daily cap + Pet Whisperer upgrade
// + gold recharges). Day-resets pet_farm_extra in the same statement so a whistle used on a fresh day starts
// from 0, matching pettingBudget's reset.
export async function grantExtraPettings(buyerId, n = 2) {
    const count = Math.max(1, Math.min(20, Number(n) || 1));
    const row = await db.queryOne(
        `UPDATE mkt_buyer
            SET pet_farm_used         = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used ELSE 0 END,
                pet_farm_used_others  = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used_others ELSE 0 END,
                pet_farm_recharges    = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_recharges ELSE 0 END,
                pet_farm_extra        = (CASE WHEN pet_farm_day = ${DAY} THEN COALESCE(pet_farm_extra,0) ELSE 0 END) + $2,
                pet_farm_day          = ${DAY}
          WHERE id = $1
          RETURNING pet_farm_extra`,
        [buyerId, count]
    ).catch(() => null);
    return { count, extra: row?.pet_farm_extra || count };
}

// Kindness Token — grant `n` EXTRA farm-rating charges for TODAY (beyond the 3/day). Day-resets farm_rate_bonus
// in the same statement so it matches rateCharge's reset boundary.
export async function grantExtraRatings(buyerId, n = 2) {
    const count = Math.max(1, Math.min(20, Number(n) || 1));
    const row = await db.queryOne(
        `UPDATE mkt_buyer
            SET farm_rate_used  = CASE WHEN farm_rate_day = ${DAY} THEN farm_rate_used ELSE 0 END,
                farm_rate_bonus = (CASE WHEN farm_rate_day = ${DAY} THEN COALESCE(farm_rate_bonus,0) ELSE 0 END) + $2,
                farm_rate_day   = ${DAY}
          WHERE id = $1
          RETURNING farm_rate_bonus`,
        [buyerId, count]
    ).catch(() => null);
    return { count, bonus: row?.farm_rate_bonus || count };
}
