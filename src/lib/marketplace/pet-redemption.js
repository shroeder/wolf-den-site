import "server-only";

import { db } from "@/lib/db";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { PET_REAL_WORLD } from "@/lib/marketplace/pet-perks.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// Real-world pet perks are redeemable in-store once per COOLDOWN period (monthly), staff-initiated from the
// admin app, and logged in mkt_pet_redemption. Mirrors the charged-item redemption flow.
export const PET_PERK_COOLDOWN_DAYS = 30;

// Which pets the member OWNS (level-unlocked or explicitly granted).
async function ownedPetIds(buyerId) {
    const [buyer, rows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
    ]);
    const level = levelForXp(buyer?.xp || 0).level;
    const granted = new Set(rows.map((r) => r.ref));
    return new Set(COLLECTIBLES.filter((p) => isCollectibleUnlocked(p, level, { owned: granted })).map((p) => p.id));
}

// Redemption state for one real-world pet perk: when it was last used + whether it's available now.
function stateFromLast(lastAt) {
    if (!lastAt) return { available: true, cooldownUntil: null, lastAt: null };
    const until = new Date(new Date(lastAt).getTime() + PET_PERK_COOLDOWN_DAYS * 86400000);
    return { available: Date.now() >= until.getTime(), cooldownUntil: until.toISOString(), lastAt: new Date(lastAt).toISOString() };
}

// A member's real-world pet perks they OWN, each with reward text + redemption state. For the member's
// pets page and the admin redemption UI.
export async function memberPetPerks(buyerId) {
    if (!buyerId) return [];
    const realWorldIds = Object.keys(PET_REAL_WORLD);
    const owned = await ownedPetIds(buyerId);
    const mine = realWorldIds.filter((id) => owned.has(id));
    if (!mine.length) return [];
    const rows = await db
        .query(`SELECT pet_id, MAX(redeemed_at) AS last_at FROM mkt_pet_redemption WHERE buyer_id = $1 AND pet_id = ANY($2) GROUP BY pet_id`, [buyerId, mine])
        .catch(() => []);
    const lastByPet = new Map(rows.map((r) => [r.pet_id, r.last_at]));
    return mine.map((id) => {
        const pet = collectibleById(id);
        return { petId: id, name: pet?.name || id, reward: PET_REAL_WORLD[id], ...stateFromLast(lastByPet.get(id)) };
    });
}

// Staff redeems a member's real-world pet perk in-store. Validates ownership + cooldown; logs it.
export async function redeemPetPerk(buyerId, petId, { by = "admin", note = null } = {}) {
    if (!buyerId || !petId) return { ok: false, error: "missing_params" };
    const reward = PET_REAL_WORLD[petId];
    if (!reward) return { ok: false, error: "no_real_world_perk" };
    const owned = await ownedPetIds(buyerId);
    if (!owned.has(petId)) return { ok: false, error: "not_owned" };
    const last = await db.queryOne(`SELECT MAX(redeemed_at) AS last_at FROM mkt_pet_redemption WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const state = stateFromLast(last?.last_at);
    if (!state.available) return { ok: false, error: "on_cooldown", cooldownUntil: state.cooldownUntil };
    await db.query(`INSERT INTO mkt_pet_redemption (buyer_id, pet_id, reward_label, redeemed_by, note) VALUES ($1, $2, $3, $4, $5)`, [buyerId, petId, reward, by, note]).catch(() => {});
    await trackActivity(buyerId, "pet_perk_redeem", { petId, reward, by }).catch(() => {});
    return { ok: true, reward };
}
