import "server-only";

import { db } from "@/lib/db";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { combinePetBonuses } from "@/lib/marketplace/pet-perks.js";

// A member's pet combat/economy bonus: passive stats from every OWNED pet + the equipped pet's signature
// perk. Dependency-light (db + collectibles + pet-perks) so boss.js can use it without an import cycle.
export async function getPetCombatBonus(buyerId) {
    if (!buyerId) return { stats: {}, economy: {}, proc: {} };
    const [buyer, rows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp,0) AS xp, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
    ]);
    const level = levelForXp(buyer?.xp || 0).level;
    const granted = new Set(rows.map((r) => r.ref));
    const owned = COLLECTIBLES.filter((p) => isCollectibleUnlocked(p, level, { owned: granted }));
    const equipped = buyer?.featured_collectible ? collectibleById(buyer.featured_collectible) : null;
    return combinePetBonuses(owned, equipped);
}

// Pure: manual-damage multiplier from a combined stats object (Might, Crit chance/power, Extra strike),
// baselined against the 25%/×2.5 crit already in memberDailyDamage. Ferocity is NOT included here — GEAR
// ferocity is 24/7 auto-damage; callers fold PET ferocity into Might before calling.
export function manualStatMultiplier(stats = {}) {
    const mightMult = 1 + (stats.might || 0) / 100;
    const p = Math.min(0.9, 0.25 + (stats.crit_chance || 0) / 100);
    const m = 2.5 + (stats.crit_power || 0) / 100;
    const critFactor = ((1 - p) + p * m) / 1.375;
    const strikes = 1 + (stats.extra_strike || 0);
    return mightMult * critFactor * strikes;
}

// Pure: extra multiplier from equipped-pet procs (erupt chance + first-hit, amortized over the day's strikes).
export function procMultiplier(proc = {}, strikes = 1) {
    const eruptFactor = proc.eruptChance ? 1 + proc.eruptChance * ((proc.eruptMult || 1) - 1) : 1;
    const firstHit = proc.firstHitMult ? 1 + (proc.firstHitMult - 1) / Math.max(1, strikes) : 1;
    return eruptFactor * firstHit;
}

// Batch (2 queries): each member's raw pet bonus (stats + proc) → Map<buyerId, {stats, proc}>. For boss sizing.
export async function getPackPetBonuses() {
    const [members, unlocks] = await Promise.all([
        db.query(`SELECT id, COALESCE(xp, 0) AS xp, featured_collectible FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []),
        db.query(`SELECT buyer_id, ref FROM mkt_cosmetic_unlock WHERE category = 'pet'`).catch(() => []),
    ]);
    const byBuyer = new Map();
    for (const u of unlocks) {
        if (!byBuyer.has(u.buyer_id)) byBuyer.set(u.buyer_id, new Set());
        byBuyer.get(u.buyer_id).add(u.ref);
    }
    const out = new Map();
    for (const mem of members) {
        const level = levelForXp(mem.xp || 0).level;
        const granted = byBuyer.get(mem.id) || new Set();
        const owned = COLLECTIBLES.filter((p) => isCollectibleUnlocked(p, level, { owned: granted }));
        const equipped = mem.featured_collectible ? collectibleById(mem.featured_collectible) : null;
        out.set(mem.id, combinePetBonuses(owned, equipped));
    }
    return out;
}
