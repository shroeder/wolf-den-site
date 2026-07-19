import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// Pet DROPS from chests + the boss. Kept in its own dependency-light module (db + collectibles + activity
// only) so chests.js / boss.js can grant pets without an import cycle through pets.js → quests.js → chests.js.

const CHEST_TIER_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

async function ownedPetSet(buyerId) {
    const rows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.ref));
}

async function grantDrop(buyerId, pet, source, meta) {
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, pet.id]).catch(() => {});
    await trackActivity(buyerId, "pet_drop", { petId: pet.id, source, ...meta });
    return { id: pet.id, name: pet.name, rarity: pet.rarity, color: pet.color, hint: pet.hint || null };
}

// A chance at a chest-source pet when opening a chest — the rarer the chest, the deeper the pet pool.
export async function maybeGrantChestPet(buyerId, openedTier) {
    if (!buyerId) return null;
    const openedIdx = CHEST_TIER_ORDER.indexOf(openedTier);
    if (openedIdx < 0) return null;
    const chance = Math.min(0.3, 0.12 + openedIdx * 0.02);
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES.filter((p) => p.source === "chest" && CHEST_TIER_ORDER.indexOf(p.chestTier) <= openedIdx && !owned.has(p.id));
    if (!eligible.length) return null;
    const pet = eligible[Math.floor(Math.random() * eligible.length)];
    return grantDrop(buyerId, pet, "chest", { tier: openedTier });
}

// A boss raffle winner has a strong chance at a rare boss-only pet.
export async function maybeGrantBossPet(buyerId, { chance = 0.6 } = {}) {
    if (!buyerId) return null;
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES.filter((p) => p.source === "boss" && !owned.has(p.id));
    if (!eligible.length) return null;
    const pet = eligible[Math.floor(Math.random() * eligible.length)];
    return grantDrop(buyerId, pet, "boss", {});
}
