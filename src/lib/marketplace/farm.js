import "server-only";

import { db } from "@/lib/db";
import { petsState } from "@/lib/marketplace/pets.js";
import { collectibleById, COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { petLevelInfo, petMaxXp, addPetXp, levelUpPet } from "@/lib/marketplace/pet-level.js";
import { CONSUMABLES, listConsumables, useConsumable as applyConsumable, buyConsumable } from "@/lib/marketplace/consumables.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemSpriteFor } from "@/lib/marketplace/item-sprites.js";
import { getGarden, farmPetCapBonus } from "@/lib/marketplace/farm-crops.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { farmRatingBits } from "@/lib/marketplace/farm-rating.js";
import { placedDecoBuffs, decoState, getPlacements } from "@/lib/marketplace/farm-decorations.js";
import { getSetting, setSetting } from "@/lib/settings.js";

// Loot-pig crown placement (owner-calibrated via the crown tool). left = flip ? 50+side% : 50-side%.
const CROWN_DEFAULT = { top: 9, side: 8, size: 22 };
export async function getCrownConfig() {
    const raw = await getSetting("loot_pig_crown", null).catch(() => null);
    if (!raw) return CROWN_DEFAULT;
    try { const c = JSON.parse(raw); return { top: Number(c.top ?? CROWN_DEFAULT.top), side: Number(c.side ?? CROWN_DEFAULT.side), size: Number(c.size ?? CROWN_DEFAULT.size) }; } catch { return CROWN_DEFAULT; }
}
export async function saveCrownConfig(cfg) {
    const c = {
        top: Math.max(-40, Math.min(50, Number(cfg?.top ?? CROWN_DEFAULT.top))),
        side: Math.max(-10, Math.min(50, Number(cfg?.side ?? CROWN_DEFAULT.side))),
        size: Math.max(12, Math.min(48, Number(cfg?.size ?? CROWN_DEFAULT.size))),
    };
    await setSetting("loot_pig_crown", JSON.stringify(c)).catch(() => {});
    return { ok: true, crownCfg: c };
}

// The Farm: a member's owned pets roam a little pasture. You can PET pets — a shared daily budget of 3
// (rechargeable for gold at a doubling cost), spent on your OWN pets (once/day/pet) OR a friend's pets when
// visiting their farm (petting theirs pays you a small thank-you). You can also FEED any pet a treat from your
// own bag — unlimited; feeding a friend's pet grants the feeder a small generosity bonus. (mkt_pet_level.buyer_id
// is TEXT → ::text.)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, matches the rest of the game
export const PET_PET_XP = 30; // pet XP the fed pet gains per petting
const PET_PET_GOLD = 12; // gold YOU earn per petting (petting is rewarding, not just chores)
const PET_PET_PLAYER_XP = 5; // player XP you earn per petting
const PET_PETS_PER_DAY = 3; // free daily pettings on your OWN pets (+ Pet Whisperer upgrade + gold recharges)
const PET_OTHERS_PER_DAY = 3; // SEPARATE free daily pettings on OTHER members' pets
// Petting a FRIEND'S pet: a smaller thank-you to the petter (their pet gets the full PET_PET_XP). Shares the
// same 3/day budget as petting your own.
const PET_OTHER_GOLD = 8;
const PET_OTHER_PLAYER_XP = 5;
// Feeding a FRIEND'S pet (unlimited — it costs one of YOUR treats): a small generosity bonus to the feeder.
// Always worth less than a treat, so it can't be farmed for profit.
const FEED_OTHER_GOLD = 15;
const FEED_OTHER_PLAYER_XP = 8;
const PET_RECHARGE_AMOUNT = 3; // extra pettings granted per paid recharge
const PET_RECHARGE_BASE = 500; // gold cost of the FIRST recharge each day; doubles every recharge (500 → 1000 → 2000 …), resets daily
const rechargeCost = (n) => PET_RECHARGE_BASE * 2 ** n;
// Wild Loot Pig
const PIG_GOLD_MIN = 100, PIG_GOLD_MAX = 250;
const PIG_ITEM_CHANCE = 0.2; // chance the pig drops an item at all
const PIG_RARITY_WEIGHTS = { common: 65, rare: 28, epic: 7 }; // up to 3rd tier, weighted toward the low end
const randInt = (n) => Math.floor(Math.random() * n);
const weightedPick = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r < 0) return k; }
    return entries[0][0];
};
const treatXp = (id) => {
    const e = CONSUMABLES[id]?.effect;
    return e?.type === "pet_level" ? "level" : e?.amount || 0;
};

// Directory of members to visit, as hero-card data (avatar + level + pet count). Newest-active first; optional
// name/alias search.
export async function farmDirectory(viewerId, { q = "", limit = 60 } = {}) {
    const term = String(q || "").trim().toLowerCase().replace(/^@/, "");
    const params = [];
    let where = "alias IS NOT NULL";
    if (viewerId) { params.push(viewerId); where += ` AND id <> $${params.length}`; }
    if (term) { params.push(`%${term}%`); where += ` AND (LOWER(alias) LIKE $${params.length} OR LOWER(COALESCE(display_name,'')) LIKE $${params.length})`; }
    params.push(Math.min(100, limit));
    const rows = await db
        .query(
            `SELECT id, alias, display_name, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip,
                    avatar_url, avatar_config, avatar_cosmetics, equipped_border, featured_collectible
               FROM mkt_buyer WHERE ${where} ORDER BY last_seen_at DESC NULLS LAST LIMIT $${params.length}`,
            params
        )
        .catch(() => []);
    const ids = rows.map((r) => r.id);
    const grantRows = ids.length
        ? await db.query(`SELECT buyer_id, COUNT(*)::int AS n FROM mkt_cosmetic_unlock WHERE category = 'pet' AND buyer_id = ANY($1) GROUP BY buyer_id`, [ids]).catch(() => [])
        : [];
    const grantCount = new Map(grantRows.map((r) => [r.buyer_id, r.n]));
    const sprites = await getPetSpriteData().catch(() => ({}));
    return rows.map((r) => {
        const level = levelForXp(r.xp).level;
        const levelPets = COLLECTIBLES.filter((c) => c.source === "level" && typeof c.level === "number" && c.level <= level).length;
        const pet = r.featured_collectible ? sprites[r.featured_collectible] : null;
        return {
            id: r.id,
            alias: r.alias,
            name: r.display_name || r.alias || "Member",
            level,
            petCount: (grantCount.get(r.id) || 0) + levelPets,
            spriteUrl: r.avatar_sprite_url || null,
            spriteFlip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            avatarUrl: avatarImageUrl(r.avatar_config, r.avatar_cosmetics) || r.avatar_url || null,
            border: r.equipped_border && r.equipped_border !== "none" ? r.equipped_border : null,
            petSpriteUrl: pet?.url || null,
            petSpriteFlip: pet?.flip === true,
        };
    });
}

// Resolve a farm owner by @alias (for inspecting someone else's farm). Returns { id, name, alias } or null.
export async function resolveFarmOwner(alias) {
    if (!alias) return null;
    const row = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE alias = $1`, [String(alias)]).catch(() => null);
    return row ? { id: row.id, name: row.display_name || row.alias || "Member", alias: row.alias } : null;
}

// Read (and lazily day-reset) a member's daily petting budgets — SEPARATE pools for your OWN pets and for
// OTHER members' pets. Idempotent — safe to call on a plain farm load.
async function pettingBudget(buyerId) {
    const b = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET pet_farm_used = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used ELSE 0 END,
                    pet_farm_used_others = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used_others ELSE 0 END,
                    pet_farm_recharges = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_recharges ELSE 0 END,
                    pet_farm_day = ${DAY}
              WHERE id = $1
              RETURNING pet_farm_used, pet_farm_used_others, pet_farm_recharges, COALESCE(farm_upgrades,'{}'::jsonb) AS farm_upgrades`,
            [buyerId]
        )
        .catch(() => null);
    const usedOwn = b?.pet_farm_used || 0;
    const usedOthers = b?.pet_farm_used_others || 0;
    const recharges = b?.pet_farm_recharges || 0;
    // OWN: base 3/day + the permanent "Pet Whisperer" upgrade + any gold recharges bought today. OTHERS: flat 3.
    const ownAllowance = PET_PETS_PER_DAY + farmPetCapBonus(b?.farm_upgrades || {}) + recharges * PET_RECHARGE_AMOUNT;
    return {
        own: { used: usedOwn, allowance: ownAllowance, left: Math.max(0, ownAllowance - usedOwn) },
        others: { used: usedOthers, allowance: PET_OTHERS_PER_DAY, left: Math.max(0, PET_OTHERS_PER_DAY - usedOthers) },
        recharges, rechargeCost: rechargeCost(recharges), rechargeAmount: PET_RECHARGE_AMOUNT,
    };
}

// Flatten the two-pool budget to the shape the client uses, keyed to the CURRENT context (your own farm →
// the "own" pool; a friend's farm → the "others" pool), while still carrying both pools for the UI.
function flatBudget(b, own) {
    const scope = own ? b.own : b.others;
    return { used: scope.used, allowance: scope.allowance, left: scope.left, scope: own ? "own" : "others", own: b.own, others: b.others, recharges: b.recharges, rechargeCost: b.rechargeCost, rechargeAmount: b.rechargeAmount };
}

// The "your own farm" extras: treats you own + a treat shop + your wallet + the petting budget. Reused on load
// and after a buy/recharge so the client can patch without a full refetch.
async function farmMineBits(buyerId, mine = true) {
    const [cons, wallet, rawBudget] = await Promise.all([
        listConsumables(buyerId).catch(() => ({ stash: [], shop: [] })),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold, COALESCE(store_credit_cents, 0) AS cc, (pig_day IS DISTINCT FROM ${DAY}) AS pig_available FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        pettingBudget(buyerId),
    ]);
    // Show the budget for the pets you're actually looking at: your own pool on your farm, the others pool on a friend's.
    const petting = flatBudget(rawBudget, mine);
    // listConsumables returns owned items under `stash` (NOT `owned`) — reading the wrong key is why banked
    // treats never showed and you could only buy. Feed from your real stash.
    const treats = (cons.stash || [])
        .filter((o) => o.kind === "treat")
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), count: o.count }));
    const treatShop = (cons.shop || [])
        .filter((o) => o.kind === "treat")
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), price: o.effectivePrice ?? o.price, canAfford: o.canAfford }));
    return { treats, treatShop, wallet: { gold: wallet?.gold || 0, storeCreditCents: wallet?.cc || 0 }, petting, pigAvailable: Boolean(wallet?.pig_available) };
}

// Debug (owner-only, gated by the farm route): clear today's pig claim so the Loot Pig can be re-tested.
export async function resetPig(buyerId) {
    if (!buyerId) return { ok: false };
    await db.query(`UPDATE mkt_buyer SET pig_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, pigAvailable: true };
}

// The Wild Loot Pig payout — once per store-local day, guarded atomically. Rolls gold + a rare item drop.
export async function claimPig(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const claim = await db.queryOne(`UPDATE mkt_buyer SET pig_day = ${DAY} WHERE id = $1 AND pig_day IS DISTINCT FROM ${DAY} RETURNING id`, [buyerId]).catch(() => null);
    if (!claim) return { ok: false, error: "already_claimed" };
    const gold = PIG_GOLD_MIN + randInt(PIG_GOLD_MAX - PIG_GOLD_MIN + 1);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "loot_pig", { balanceAfter: paid?.gold }).catch(() => {});
    let item = null;
    if (Math.random() < PIG_ITEM_CHANCE) {
        const rarity = weightedPick(PIG_RARITY_WEIGHTS);
        const pool = ITEMS.filter((it) => it.rarity === rarity);
        const def = pool.length ? pool[randInt(pool.length)] : null;
        if (def) {
            const g = await grantItem(buyerId, def.id, "loot_pig").catch(() => null);
            item = { id: def.id, name: def.name, rarity: def.rarity, slot: def.slot || null, image: await itemSpriteFor(def.id).catch(() => null), isNew: Boolean(g?.granted) };
        }
    }
    await trackActivity(buyerId, "loot_pig", { gold, item: item?.name || null }).catch(() => {});
    return { ok: true, gold, goldAfter: paid?.gold ?? null, item };
}

// A member's farm state. viewerId === ownerId ⟺ it's your farm (petting enabled + per-pet "petted today" flags).
export async function getFarm(ownerId, viewerId) {
    if (!ownerId) return null;
    const [owner, state, sprites, pettedRows] = await Promise.all([
        db.queryOne(`SELECT id, display_name, alias, avatar_sprite_url, avatar_sprite_flip, equipped_border FROM mkt_buyer WHERE id = $1`, [ownerId]).catch(() => null),
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
    // The VIEWER's own treats / wallet / petting budget power the pet + feed actions — whether they're standing
    // on their own farm or a friend's. (On a friend's farm you can still pet, spending your budget, and feed
    // using your treats.) pettedToday only limits YOUR OWN pets; a friend's pets you can pet freely (budget cap).
    const extras = viewerId ? await farmMineBits(viewerId, mine) : { treats: [], treatShop: [], wallet: null, petting: null, pigAvailable: false };
    // Your crops only show on your own farm (you tend your own garden).
    const [garden, ratingBits, placements, decorations, crownCfg] = await Promise.all([
        mine ? getGarden(ownerId).catch(() => null) : Promise.resolve(null),
        farmRatingBits(ownerId, viewerId).catch(() => ({ rating: null })),
        getPlacements(ownerId).catch(() => []), // the OWNER's placed decorations — rendered on any farm
        mine ? decoState(viewerId).catch(() => null) : Promise.resolve(null), // your inventory — manage on your own farm only
        getCrownConfig().catch(() => null), // loot-pig crown placement (owner-calibrated)
    ]);
    return {
        owner: { id: owner.id, name: owner.display_name || owner.alias || "Member", alias: owner.alias || null, avatarUrl: owner.avatar_sprite_url || null, avatarFlip: owner.avatar_sprite_flip === true, border: owner.equipped_border && owner.equipped_border !== "none" ? owner.equipped_border : null },
        mine,
        garden,
        canPet: Boolean(viewerId), // pet your own OR a friend's pets (spends your shared 3/day budget)
        canFeed: Boolean(viewerId), // feed with your own treats
        petXp: PET_PET_XP,
        petGold: mine ? PET_PET_GOLD : PET_OTHER_GOLD,
        pets: mine ? pets : pets.map((p) => ({ ...p, petted: false })),
        placements, // decorations placed in this pasture (rendered for everyone)
        decorations, // your owned-decoration inventory + buffs (own farm only; null when visiting)
        crownCfg, // loot-pig crown placement
        ...extras,
        ...ratingBits,
    };
}

// Use a pet TREAT on a specific owned pet (feed it XP or instant-level it).
export async function feedPetItem(feederId, petId, consumableId, ownerId = null) {
    if (!feederId || !petId || !consumableId) return { ok: false, error: "bad_request" };
    const c = CONSUMABLES[consumableId];
    if (!c || (c.effect?.type !== "pet_xp" && c.effect?.type !== "pet_level")) return { ok: false, error: "not_a_treat" };
    const petOwner = ownerId || feederId;
    const own = String(petOwner) === String(feederId);
    // The pet must belong to whoever's farm this is; the treat always comes from the feeder's own bag.
    const ownerState = await petsState(petOwner).catch(() => null);
    if (!ownerState || !(ownerState.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };
    const def = collectibleById(petId);

    if (own) {
        const res = await applyConsumable(feederId, consumableId, null, petId);
        if (!res.ok) return res;
        const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [feederId, petId]).catch(() => null);
        const info = petLevelInfo(row?.xp || 0, def?.rarity || "common");
        return { ...res, petId, level: info.level, xp: row?.xp || 0, into: info.into, span: info.span, maxed: info.maxed };
    }

    // Feeding a FRIEND'S pet: spend one of the feeder's treats, land the XP on the OWNER's pet, and thank the
    // feeder for the generosity. Unlimited (each feed costs a real treat).
    const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [feederId, consumableId]).catch(() => null);
    if (!dec) return { ok: false, error: "insufficient" };
    const applied = c.effect.type === "pet_level"
        ? await levelUpPet(petOwner, petId).catch(() => ({ ok: false }))
        : await addPetXp(petOwner, petId, c.effect.amount).catch(() => ({ ok: false }));
    const leveled = c.effect.type === "pet_level" ? Boolean(applied?.ok) : Boolean(applied?.leveled);
    await awardXp(feederId, "feed_other", { points: FEED_OTHER_PLAYER_XP, gold: FEED_OTHER_GOLD }).catch(() => {});
    await trackActivity(feederId, "feed_other", { petId, owner: petOwner }).catch(() => {});
    await bumpQuestProgress(feederId, "feed_pet", 1).catch(() => {});
    // Feeds count as love too → show up in the owner's "who petted your pets" recap, crediting the pet-XP fed.
    await db.query(`INSERT INTO mkt_pet_visit (owner_id, petter_id, pet_id, xp) VALUES ($1, $2, $3, $4)`, [petOwner, feederId, petId, c.effect?.amount || 0]).catch(() => {});
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [petOwner, petId]).catch(() => null);
    const info = petLevelInfo(row?.xp || 0, def?.rarity || "common");
    return {
        ok: true,
        petId,
        remaining: dec.count,
        gave: c.name,
        forOther: true,
        goldGained: FEED_OTHER_GOLD,
        playerXp: FEED_OTHER_PLAYER_XP,
        petLevelUp: leveled ? { petId, petName: def?.name || "the pet", level: applied.level, rarity: def?.rarity || "common", maxed: applied.level >= 5 } : null,
        level: info.level,
        xp: row?.xp || 0,
        into: info.into,
        span: info.span,
        maxed: info.maxed,
    };
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
export async function petPet(petterId, petId, ownerId = null) {
    if (!petterId || !petId) return { ok: false, error: "bad_request" };
    const petOwner = ownerId || petterId;
    const own = String(petOwner) === String(petterId);
    // The pet must belong to whoever's farm this is.
    const ownerState = await petsState(petOwner).catch(() => null);
    if (!ownerState || !(ownerState.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };

    const budget = await pettingBudget(petterId);
    // Separate pools: your OWN pets vs OTHER members' pets (3 each per day).
    const col = own ? "pet_farm_used" : "pet_farm_used_others";
    const pool = own ? budget.own : budget.others;
    if (pool.left <= 0) return { ok: false, error: "no_pets_left", petting: flatBudget(budget, own) };

    // Reserve a slot from the right pool FIRST (guarded so a burst can't exceed the allowance).
    const slot = await db
        .queryOne(
            `UPDATE mkt_buyer SET ${col} = ${col} + 1
              WHERE id = $1 AND pet_farm_day = ${DAY} AND ${col} < $2
              RETURNING ${col} AS n`,
            [petterId, pool.allowance]
        )
        .catch(() => null);
    if (!slot) return { ok: false, error: "no_pets_left", petting: flatBudget(await pettingBudget(petterId), own) };

    const def = collectibleById(petId);
    const maxXp = petMaxXp(def?.rarity || "common");
    // The FARM OWNER's placed decorations (pet-bond buff) boost the pet XP earned from petting on their farm.
    const ownerBuffs = await placedDecoBuffs(petOwner).catch(() => null);
    const petXpAmt = Math.round(PET_PET_XP * (1 + (ownerBuffs?.petXp || 0) / 100));
    let newXp = null;
    if (own) {
        // Your OWN pet: once/day/pet guard (spread the love). If already petted today, refund the slot.
        const row = await db
            .queryOne(
                `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, petted_day, last_tick_at, updated_at)
                 VALUES ($1::text, $2, LEAST($3::int, $4::int), ${DAY}, NOW(), NOW())
                 ON CONFLICT (buyer_id, pet_id)
                 DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3::int, $4::int), petted_day = ${DAY}, updated_at = NOW()
                  WHERE mkt_pet_level.petted_day IS DISTINCT FROM ${DAY}
                 RETURNING xp`,
                [petterId, petId, petXpAmt, maxXp]
            )
            .catch(() => null);
        if (!row) {
            await db.query(`UPDATE mkt_buyer SET ${col} = GREATEST(0, ${col} - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [petterId]).catch(() => {});
            return { ok: false, error: "already_petted", petting: flatBudget(await pettingBudget(petterId), own) };
        }
        newXp = row.xp;
    } else {
        // A FRIEND'S pet: no per-pet guard (your 3/day budget is the cap), XP lands on the owner's pet.
        const res = await addPetXp(petOwner, petId, petXpAmt).catch(() => null);
        if (!res) {
            await db.query(`UPDATE mkt_buyer SET ${col} = GREATEST(0, ${col} - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [petterId]).catch(() => {});
            return { ok: false, error: "pet_error", petting: flatBudget(await pettingBudget(petterId), own) };
        }
        const r = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [petOwner, petId]).catch(() => null);
        newXp = r?.xp || 0;
        // Log it so the owner sees who petted which of their pets (and the XP it earned) on their next visit.
        await db.query(`INSERT INTO mkt_pet_visit (owner_id, petter_id, pet_id, xp) VALUES ($1, $2, $3, $4)`, [petOwner, petterId, petId, petXpAmt]).catch(() => {});
    }

    // Reward the petter: your own pet pays a bit more (the bond); a friend's pet a small thank-you.
    const goldGained = own ? PET_PET_GOLD : PET_OTHER_GOLD;
    const playerXp = own ? PET_PET_PLAYER_XP : PET_OTHER_PLAYER_XP;
    await awardXp(petterId, own ? "pet_farm" : "pet_farm_other", { points: playerXp, gold: goldGained }).catch(() => {});
    await trackActivity(petterId, own ? "pet_farm" : "pet_other", { petId, owner: own ? undefined : petOwner }).catch(() => {});
    await bumpQuestProgress(petterId, "pet_animal", 1).catch(() => {});

    const info = petLevelInfo(newXp, def?.rarity || "common");
    return {
        ok: true,
        petId,
        forOther: !own,
        xpGained: petXpAmt,
        goldGained,
        playerXp,
        level: info.level,
        xp: newXp,
        into: info.into,
        span: info.span,
        maxed: info.maxed,
        petting: flatBudget(await pettingBudget(petterId), own),
    };
}

// "Who petted your pets" welcome-back recap. Returns every unseen petting on YOUR pets, grouped by the visitor
// (and, under each visitor, which pets they petted + the XP each gained). Fetching it marks the rows seen so it
// pops once — same contract as the raid-defense report.
export async function getUnseenPetVisits(ownerId) {
    if (!ownerId) return { visits: [], totalXp: 0, totalVisits: 0, petterCount: 0 };
    const rows = await db
        .query(
            `SELECT petter_id, pet_id, COUNT(*)::int AS n, COALESCE(SUM(xp), 0)::int AS xp
               FROM mkt_pet_visit WHERE owner_id = $1 AND seen_at IS NULL
              GROUP BY petter_id, pet_id`,
            [ownerId]
        )
        .catch(() => []);
    if (!rows.length) return { visits: [], totalXp: 0, totalVisits: 0, petterCount: 0 };
    const ids = [...new Set(rows.map((r) => r.petter_id))];
    const [buyers, petMap] = await Promise.all([
        db.query(`SELECT id, display_name, alias, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip, equipped_border FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []),
        getPetSpriteData().catch(() => ({})),
    ]);
    const byId = new Map((buyers || []).map((b) => [b.id, b]));
    const grouped = new Map();
    for (const r of rows) {
        if (!grouped.has(r.petter_id)) grouped.set(r.petter_id, []);
        const def = collectibleById(r.pet_id);
        const sp = petMap[r.pet_id] || {};
        grouped.get(r.petter_id).push({
            petId: r.pet_id, name: def?.name || r.pet_id, rarity: def?.rarity || "common",
            spriteUrl: sp.url || null, spriteFlip: sp.flip === true, count: r.n, xp: r.xp,
        });
    }
    const visits = [...grouped.entries()].map(([pid, pets]) => {
        const b = byId.get(pid) || {};
        return {
            petter: {
                name: b.display_name || b.alias || "A visitor",
                alias: b.alias || null,
                level: levelForXp(b.xp || 0).level,
                avatarUrl: b.avatar_sprite_url || null,
                avatarFlip: b.avatar_sprite_url ? b.avatar_sprite_flip === true : false,
                border: b.equipped_border && b.equipped_border !== "none" ? b.equipped_border : null,
            },
            pets: pets.sort((a, c) => c.xp - a.xp),
            xp: pets.reduce((s, p) => s + p.xp, 0),
            count: pets.reduce((s, p) => s + p.count, 0),
        };
    }).sort((a, b) => b.xp - a.xp);
    await db.query(`UPDATE mkt_pet_visit SET seen_at = NOW() WHERE owner_id = $1 AND seen_at IS NULL`, [ownerId]).catch(() => {});
    return { visits, totalXp: rows.reduce((s, r) => s + r.xp, 0), totalVisits: rows.reduce((s, r) => s + r.n, 0), petterCount: ids.length };
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
    if (!paid) return { ok: false, error: "insufficient", cost, petting: flatBudget(budget, true) };
    await logCoin(buyerId, -cost, "pet_recharge", { balanceAfter: paid.gold }).catch(() => {});
    return { ok: true, spent: cost, petting: flatBudget(await pettingBudget(buyerId), true), wallet: { gold: paid.gold } };
}
