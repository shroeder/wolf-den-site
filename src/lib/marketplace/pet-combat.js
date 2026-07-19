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

// How much a member's pets multiply their EXPECTED manual daily damage — used to size the boss so pet power
// is baked into HP. Mirrors attackBoss: pet Might+Ferocity → damage %, crit chance/power, extra strikes,
// and the erupt/first-hit procs. Baselined against the 25%/×2.5 crit already assumed in memberDailyDamage.
export function petManualMultiplier(bonus) {
    const s = bonus?.stats || {};
    const proc = bonus?.proc || {};
    const mightMult = 1 + ((s.might || 0) + (s.ferocity || 0)) / 100;
    const p = Math.min(0.9, 0.25 + (s.crit_chance || 0) / 100);
    const m = 2.5 + (s.crit_power || 0) / 100;
    const critFactor = ((1 - p) + p * m) / 1.375;
    const strikes = 1 + (s.extra_strike || 0);
    const eruptFactor = proc.eruptChance ? 1 + proc.eruptChance * ((proc.eruptMult || 1) - 1) : 1;
    const firstHit = proc.firstHitMult ? 1 + (proc.firstHitMult - 1) / strikes : 1;
    return mightMult * critFactor * strikes * eruptFactor * firstHit;
}

// Batch (2 queries): each member's pet manual-damage multiplier → Map<buyerId, mult>. For boss sizing.
export async function getPackPetMultipliers() {
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
        out.set(mem.id, petManualMultiplier(combinePetBonuses(owned, equipped)));
    }
    return out;
}
