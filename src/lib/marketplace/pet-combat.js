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
