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

// A top boss dealer has a SMALL chance at a boss-only pet. Deliberately stingy (was 60% → too many
// legendaries too fast) and now rolled for the top 3 dealers rather than guaranteed to #1. When it does hit,
// it's almost always a LEGENDARY boss pet; the two MYTHIC boss pets (Fairy, Kraken) only surface on a rare
// sub-roll so the rarest companions stay genuinely rare.
export async function maybeGrantBossPet(buyerId, { chance = 0.12 } = {}) {
    if (!buyerId) return null;
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    const eligible = COLLECTIBLES.filter((p) => p.source === "boss" && !owned.has(p.id));
    if (!eligible.length) return null;
    const legendary = eligible.filter((p) => p.rarity === "legendary");
    // 90% of drops draw only from legendary boss pets; mythic boss pets need the 10% sub-roll.
    const pool = legendary.length && Math.random() > 0.1 ? legendary : eligible;
    const pet = pool[Math.floor(Math.random() * pool.length)];
    return grantDrop(buyerId, pet, "boss", {});
}

// EXCLUSIVE raid pets — the ONLY source is completing a live Town raid, so they stay a prestige badge of the
// pack's regulars. Deliberately very rare: best odds on a Golem BOSS kill, slimmer on an escaped boss or a
// skirmish raid. The rarest (eternal Golem's Heart) can ONLY drop from an actual Golem kill.
const RAID_PET_WEIGHT = { mythic: 60, ascendant: 22, eternal: 6 };
export async function maybeGrantRaidPet(buyerId, { boss = false, killed = false } = {}) {
    if (!buyerId) return null;
    const chance = boss ? (killed ? 0.08 : 0.02) : 0.015;
    if (Math.random() > chance) return null;
    const owned = await ownedPetSet(buyerId);
    let eligible = COLLECTIBLES.filter((p) => p.raidExclusive && !owned.has(p.id));
    if (!(boss && killed)) eligible = eligible.filter((p) => p.rarity !== "eternal"); // Golem's Heart = kill trophy only
    if (!eligible.length) return null;
    const total = eligible.reduce((s, p) => s + (RAID_PET_WEIGHT[p.rarity] || 10), 0);
    let r = Math.random() * total;
    let pet = eligible[0];
    for (const p of eligible) { if ((r -= (RAID_PET_WEIGHT[p.rarity] || 10)) < 0) { pet = p; break; } }
    return grantDrop(buyerId, pet, "raid", { boss, killed });
}
