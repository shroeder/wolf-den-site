import "server-only";

import { db } from "@/lib/db";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked, petPassive, petPrice } from "@/lib/marketplace/collectibles.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// Pets a member has been explicitly granted (shop / achievement / chest / boss / elite / trade), from the
// cosmetic-unlock ledger. Level pets are owned implicitly by reaching the level.
async function grantedPetSet(buyerId) {
    const rows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.ref));
}

// The member's full pet state: which pets they own, which is equipped, level + gold, and the total passive
// bonus their whole menagerie provides.
export async function petsState(buyerId) {
    if (!buyerId) return { ownedIds: [], featured: null, level: 1, gold: 0, passiveTotal: 0, signedIn: false };
    const buyer = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(buyer?.xp || 0).level;
    const granted = await grantedPetSet(buyerId);
    const ownedIds = [];
    let passiveTotal = 0;
    for (const pet of COLLECTIBLES) {
        if (isCollectibleUnlocked(pet, level, { owned: granted })) {
            ownedIds.push(pet.id);
            passiveTotal += petPassive(pet).value;
        }
    }
    return { ownedIds, featured: buyer?.featured_collectible || null, level, gold: buyer?.gold || 0, passiveTotal, signedIn: true };
}

// Equip (feature) a pet you own — it rides on your profile/hero card and grants its active buff.
export async function equipPet(buyerId, petId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pet = collectibleById(petId);
    if (!pet) return { ok: false, error: "not_found" };
    const state = await petsState(buyerId);
    if (!state.ownedIds.includes(petId)) return { ok: false, error: "not_owned" };
    await db.query(`UPDATE mkt_buyer SET featured_collectible = $2, updated_at = NOW() WHERE id = $1`, [buyerId, petId]).catch(() => {});
    await bumpQuestProgress(buyerId, "equip", 1).catch(() => {});
    await trackActivity(buyerId, "equip_pet", { petId });
    return { ok: true };
}

export async function unequipPet(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    await db.query(`UPDATE mkt_buyer SET featured_collectible = NULL, updated_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true };
}

// Buy a shop pet with gold (atomic guarded deduct, then grant).
export async function buyPet(buyerId, petId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pet = collectibleById(petId);
    if (!pet || pet.source !== "shop") return { ok: false, error: "not_for_sale" };
    const already = await db.queryOne(`SELECT 1 FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = $2`, [buyerId, petId]).catch(() => null);
    if (already) return { ok: false, error: "already_owned" };
    const price = petPrice(pet);
    const deducted = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!deducted) return { ok: false, error: "not_enough_gold" };
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, petId]).catch(() => {});
    await trackActivity(buyerId, "buy_pet", { petId, price });
    return { ok: true, gold: deducted.gold };
}
