import "server-only";

import { db } from "@/lib/db";
import { petsState } from "@/lib/marketplace/pets.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { petLevelInfo, petMaxXp } from "@/lib/marketplace/pet-level.js";
import { CONSUMABLES, listConsumables, useConsumable as applyConsumable, buyConsumable } from "@/lib/marketplace/consumables.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// The Farm: a member's owned pets roam a little pasture. On your OWN farm you can PET pets — a shared daily
// budget of 3 (rechargeable for gold at a doubling cost). Each pet can still only be petted once/day, but the
// 3/day cap is the real limiter. Other members' farms are view-only. (mkt_pet_level.buyer_id is TEXT → ::text.)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, matches the rest of the game
export const PET_PET_XP = 30; // pet XP the fed pet gains per petting
const PET_PET_GOLD = 12; // gold YOU earn per petting (petting is rewarding, not just chores)
const PET_PET_PLAYER_XP = 5; // player XP you earn per petting
const PET_PETS_PER_DAY = 3; // free daily pettings (total, across all pets)
const PET_RECHARGE_AMOUNT = 3; // extra pettings granted per paid recharge
const PET_RECHARGE_BASE = 200; // gold cost of the FIRST recharge; doubles each time (200 → 400 → 800 …)
const rechargeCost = (n) => PET_RECHARGE_BASE * 2 ** n;
const treatXp = (id) => {
    const e = CONSUMABLES[id]?.effect;
    return e?.type === "pet_level" ? "level" : e?.amount || 0;
};

// Resolve a farm owner by @alias (for inspecting someone else's farm). Returns { id, name, alias } or null.
export async function resolveFarmOwner(alias) {
    if (!alias) return null;
    const row = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE alias = $1`, [String(alias)]).catch(() => null);
    return row ? { id: row.id, name: row.display_name || row.alias || "Member", alias: row.alias } : null;
}

// Read (and lazily day-reset) a member's daily petting budget. Idempotent — safe to call on a plain farm load.
async function pettingBudget(buyerId) {
    const b = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET pet_farm_used = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used ELSE 0 END,
                    pet_farm_recharges = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_recharges ELSE 0 END,
                    pet_farm_day = ${DAY}
              WHERE id = $1
              RETURNING pet_farm_used, pet_farm_recharges`,
            [buyerId]
        )
        .catch(() => null);
    const used = b?.pet_farm_used || 0;
    const recharges = b?.pet_farm_recharges || 0;
    const allowance = PET_PETS_PER_DAY + recharges * PET_RECHARGE_AMOUNT;
    return { used, allowance, left: Math.max(0, allowance - used), recharges, rechargeCost: rechargeCost(recharges), rechargeAmount: PET_RECHARGE_AMOUNT };
}

// The "your own farm" extras: treats you own + a treat shop + your wallet + the petting budget. Reused on load
// and after a buy/recharge so the client can patch without a full refetch.
async function farmMineBits(buyerId) {
    const [cons, wallet, petting] = await Promise.all([
        listConsumables(buyerId).catch(() => ({ owned: [], shop: [] })),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold, COALESCE(store_credit_cents, 0) AS cc FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        pettingBudget(buyerId),
    ]);
    const treats = (cons.owned || [])
        .filter((o) => o.kind === "treat")
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), count: o.count }));
    const treatShop = (cons.shop || [])
        .filter((o) => o.kind === "treat")
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), price: o.effectivePrice ?? o.price, canAfford: o.canAfford }));
    return { treats, treatShop, wallet: { gold: wallet?.gold || 0, storeCreditCents: wallet?.cc || 0 }, petting };
}

// A member's farm state. viewerId === ownerId ⟺ it's your farm (petting enabled + per-pet "petted today" flags).
export async function getFarm(ownerId, viewerId) {
    if (!ownerId) return null;
    const [owner, state, sprites, pettedRows] = await Promise.all([
        db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE id = $1`, [ownerId]).catch(() => null),
        petsState(ownerId).catch(() => null),
        getPetSpriteData().catch(() => ({})),
        db.query(`SELECT pet_id FROM mkt_pet_level WHERE buyer_id = $1::text AND petted_day = ${DAY}`, [ownerId]).catch(() => []),
    ]);
    if (!owner || !state) return null;
    const pettedToday = new Set(pettedRows.map((r) => r.pet_id));
    const mine = String(viewerId) === String(ownerId);
    const pets = (state.ownedIds || [])
        .map((id) => {
            const def = collectibleById(id);
            const sp = sprites[id];
            const lvl = state.petLevels?.[id];
            return {
                id,
                name: def?.name || id,
                rarity: def?.rarity || "common",
                source: def?.source || null,
                level: lvl?.level || 1,
                xp: lvl?.xp || 0,
                into: lvl?.into || 0,
                span: lvl?.span || 0,
                maxed: Boolean(lvl?.maxed),
                spriteUrl: sp?.url || null,
                flip: sp?.flip === true,
                petted: pettedToday.has(id),
            };
        })
        .filter((p) => p.spriteUrl);
    const extras = mine ? await farmMineBits(ownerId) : { treats: [], treatShop: [], wallet: null, petting: null };
    return {
        owner: { id: owner.id, name: owner.display_name || owner.alias || "Member", alias: owner.alias || null },
        mine,
        canPet: mine,
        petXp: PET_PET_XP,
        petGold: PET_PET_GOLD,
        pets,
        ...extras,
    };
}

// Use a pet TREAT on a specific owned pet (feed it XP or instant-level it).
export async function feedPetItem(buyerId, petId, consumableId) {
    if (!buyerId || !petId || !consumableId) return { ok: false, error: "bad_request" };
    const c = CONSUMABLES[consumableId];
    if (!c || (c.effect?.type !== "pet_xp" && c.effect?.type !== "pet_level")) return { ok: false, error: "not_a_treat" };
    const state = await petsState(buyerId).catch(() => null);
    if (!state || !(state.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };
    const res = await applyConsumable(buyerId, consumableId, null, petId);
    if (!res.ok) return res;
    const def = collectibleById(petId);
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [buyerId, petId]).catch(() => null);
    const info = petLevelInfo(row?.xp || 0, def?.rarity || "common");
    return { ...res, petId, level: info.level, xp: row?.xp || 0, into: info.into, span: info.span, maxed: info.maxed };
}

// Buy a pet treat from the farm (routes through buyConsumable). Returns fresh treats + wallet on success, or
// { ok:false, error:"insufficient" } so the client can surface the store-credit CTA.
export async function buyTreat(buyerId, consumableId) {
    const c = CONSUMABLES[consumableId];
    if (!c || c.kind !== "treat" || !c.price) return { ok: false, error: "not_buyable" };
    const res = await buyConsumable(buyerId, consumableId);
    if (!res.ok) return res;
    const bits = await farmMineBits(buyerId);
    return { ok: true, name: c.name, ...bits };
}

// Pet one of YOUR pets: spends one from the shared daily budget, gives the pet XP + rewards YOU gold & XP.
// Each pet can only be petted once/day (spread the love), and the 3/day total is the real cap.
export async function petPet(buyerId, petId) {
    if (!buyerId || !petId) return { ok: false, error: "bad_request" };
    const state = await petsState(buyerId).catch(() => null);
    if (!state || !(state.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };

    const budget = await pettingBudget(buyerId);
    if (budget.left <= 0) return { ok: false, error: "no_pets_left", petting: budget };

    // Reserve a slot from the daily budget FIRST (guarded so we can't exceed the allowance under a burst).
    const slot = await db
        .queryOne(
            `UPDATE mkt_buyer SET pet_farm_used = pet_farm_used + 1
              WHERE id = $1 AND pet_farm_day = ${DAY} AND pet_farm_used < $2
              RETURNING pet_farm_used`,
            [buyerId, budget.allowance]
        )
        .catch(() => null);
    if (!slot) return { ok: false, error: "no_pets_left", petting: budget };

    // Now the per-pet once/day feed. If this pet was already petted today, refund the reserved slot.
    const def = collectibleById(petId);
    const maxXp = petMaxXp(def?.rarity || "common");
    const row = await db
        .queryOne(
            `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, petted_day, last_tick_at, updated_at)
             VALUES ($1::text, $2, LEAST($3::int, $4::int), ${DAY}, NOW(), NOW())
             ON CONFLICT (buyer_id, pet_id)
             DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3::int, $4::int), petted_day = ${DAY}, updated_at = NOW()
              WHERE mkt_pet_level.petted_day IS DISTINCT FROM ${DAY}
             RETURNING xp`,
            [buyerId, petId, PET_PET_XP, maxXp]
        )
        .catch(() => null);
    if (!row) {
        await db.query(`UPDATE mkt_buyer SET pet_farm_used = GREATEST(0, pet_farm_used - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [buyerId]).catch(() => {});
        return { ok: false, error: "already_petted", petting: await pettingBudget(buyerId) };
    }

    // Reward YOU for the bond: gold + a little XP (awardXp logs the coin accrual + trickles the equipped pet).
    await awardXp(buyerId, "pet_farm", { points: PET_PET_PLAYER_XP, gold: PET_PET_GOLD }).catch(() => {});

    const info = petLevelInfo(row.xp, def?.rarity || "common");
    return {
        ok: true,
        petId,
        xpGained: PET_PET_XP,
        goldGained: PET_PET_GOLD,
        playerXp: PET_PET_PLAYER_XP,
        level: info.level,
        xp: row.xp,
        into: info.into,
        span: info.span,
        maxed: info.maxed,
        petting: await pettingBudget(buyerId),
    };
}

// Pay gold to recharge the daily petting budget. Cost doubles each recharge that day.
export async function rechargePetting(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const budget = await pettingBudget(buyerId); // day-resets + gives current recharge count
    const cost = rechargeCost(budget.recharges);
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET gold = gold - $2, pet_farm_recharges = pet_farm_recharges + 1
              WHERE id = $1 AND pet_farm_day = ${DAY} AND gold >= $2
              RETURNING gold, pet_farm_recharges`,
            [buyerId, cost]
        )
        .catch(() => null);
    if (!paid) return { ok: false, error: "insufficient", cost, petting: budget };
    await logCoin(buyerId, -cost, "pet_recharge", { balanceAfter: paid.gold }).catch(() => {});
    return { ok: true, spent: cost, petting: await pettingBudget(buyerId), wallet: { gold: paid.gold } };
}
