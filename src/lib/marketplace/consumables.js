import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { itemById } from "@/lib/marketplace/items.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addEquippedPetXp, levelUpEquippedPet } from "@/lib/marketplace/pet-level.js";
import { previewShopCoupon, consumeShopCoupon } from "@/lib/marketplace/shop-coupon.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// CONSUMABLES — one-shot, SELF-USE boosts (the player uses them from their stash; no admin involvement).
// Three buyable flavors (potions/scrolls/stones) plus two ultra-rare "relics" that only drop from the top
// chests. Effect types the boss fight / gear system understand:
//   xp             → instant XP
//   strikes        → +N boss attacks TODAY (expires end of day)
//   damage         → ×mult boss damage for `hours` (your manual strikes)
//   recharge       → refill ALL charges on a chosen charged item (target)
//   reset_cooldown → clear the cooldown on a chosen charged item that still has a charge (target)
//   pet_xp         → feed the EQUIPPED pet a flat amount of pet-XP (levels it toward Lv5)
//   pet_level      → instantly bump the equipped pet up one level
//   spin_token     → grant N daily-wheel spins
//   spin_reset     → refresh the free daily spin (spin again today)
export const CONSUMABLES = {
    scroll_wisdom: { name: "Tome of Wisdom", emoji: "📜", kind: "scroll", desc: "Instantly gain 500 XP.", price: 1500, effect: { type: "xp", amount: 500 } },
    scroll_ancient: { name: "Ancient Codex", emoji: "📖", kind: "scroll", desc: "Instantly gain 2,000 XP.", price: 5000, effect: { type: "xp", amount: 2000 } },
    pot_adrenaline: { name: "Adrenaline Vial", emoji: "🧪", kind: "potion", desc: "Gain +2 boss attacks today.", price: 1200, effect: { type: "strikes", amount: 2 } },
    pot_secondwind: { name: "Second Wind", emoji: "🌀", kind: "potion", desc: "Gain +5 boss attacks today.", price: 3200, effect: { type: "strikes", amount: 5 } },
    pot_berserker: { name: "Berserker's Brew", emoji: "🍺", kind: "potion", desc: "DOUBLE your boss damage for 24 hours.", price: 4000, effect: { type: "damage", mult: 2, hours: 24 } },
    pot_fury: { name: "Bottled Fury", emoji: "🔥", kind: "potion", desc: "TRIPLE your boss damage for 6 hours.", price: 6500, effect: { type: "damage", mult: 3, hours: 6 } },
    stone_ember: { name: "Ember Stone", emoji: "🔴", kind: "stone", desc: "DOUBLE your boss damage for 12 hours.", price: 3500, effect: { type: "damage", mult: 2, hours: 12 } },
    stone_storm: { name: "Storm Crystal", emoji: "🔷", kind: "stone", desc: "Gain +3 boss attacks today.", price: 2000, effect: { type: "strikes", amount: 3 } },
    // ULTRA relics — no gold price (drop only from the highest chests). Applied to a charged item you pick.
    elixir_renewal: { name: "Elixir of Renewal", emoji: "⚗️", kind: "relic", price: null, target: "recharge", desc: "Fully RECHARGE all charges on one of your charged items.", effect: { type: "recharge" } },
    sands_of_time: { name: "Sands of Time", emoji: "⏳", kind: "relic", price: null, target: "cooldown", desc: "Instantly RESET the cooldown on a charged item that still has a charge left.", effect: { type: "reset_cooldown" } },
    // PET TREATS — feed your EQUIPPED pet to level it up. Six buyable tiers + four drop-only.
    treat_bone: { name: "Pet Treat", emoji: "🦴", kind: "treat", desc: "Feed your equipped pet +25 pet XP.", price: 400, effect: { type: "pet_xp", amount: 25 } },
    treat_snack: { name: "Hearty Snack", emoji: "🍖", kind: "treat", desc: "Feed your equipped pet +75 pet XP.", price: 1000, effect: { type: "pet_xp", amount: 75 } },
    treat_toy: { name: "Chew Toy", emoji: "🧸", kind: "treat", desc: "Feed your equipped pet +150 pet XP.", price: 1800, effect: { type: "pet_xp", amount: 150 } },
    treat_feast: { name: "Pet Feast", emoji: "🍲", kind: "treat", desc: "Feed your equipped pet +300 pet XP.", price: 3200, effect: { type: "pet_xp", amount: 300 } },
    treat_golden: { name: "Golden Bone", emoji: "✨", kind: "treat", desc: "Feed your equipped pet +600 pet XP.", price: 6000, effect: { type: "pet_xp", amount: 600 } },
    treat_kibble: { name: "Legendary Kibble", emoji: "🥩", kind: "treat", desc: "Feed your equipped pet +1,200 pet XP.", price: 10000, effect: { type: "pet_xp", amount: 1200 } },
    // Drop-only pet treats (chests / boss).
    treat_wild: { name: "Wild Rations", emoji: "🌿", kind: "treat", price: null, desc: "Feed your equipped pet +400 pet XP.", effect: { type: "pet_xp", amount: 400 } },
    treat_marrow: { name: "Ancient Marrow", emoji: "🍥", kind: "treat", price: null, desc: "Feed your equipped pet +800 pet XP.", effect: { type: "pet_xp", amount: 800 } },
    treat_mythic: { name: "Mythic Morsel", emoji: "💎", kind: "treat", price: null, desc: "Feed your equipped pet +1,500 pet XP.", effect: { type: "pet_xp", amount: 1500 } },
    treat_ambrosia: { name: "Ambrosia", emoji: "🍯", kind: "treat", price: null, desc: "Instantly LEVEL UP your equipped pet.", effect: { type: "pet_level" } },
    // SPIN charges — feed the daily wheel. Tokens = extra spins; a rewind refreshes your free daily spin.
    spin_lucky_coin: { name: "Lucky Coin", emoji: "🎟️", kind: "spin", desc: "Gain +2 wheel spins.", price: 1500, effect: { type: "spin_token", amount: 2 } },
    spin_golden_ticket: { name: "Golden Ticket", emoji: "🎫", kind: "spin", price: null, desc: "Gain +5 wheel spins.", effect: { type: "spin_token", amount: 5 } },
    spin_rewind: { name: "Wheel Rewind", emoji: "⏪", kind: "spin", price: null, desc: "Refresh your FREE daily spin — spin again now.", effect: { type: "spin_reset" } },
};

// Buyable order (shop). Relics + drop-only treats are intentionally excluded — they're chest/boss-only.
const SHOP_ORDER = [
    "scroll_wisdom", "scroll_ancient", "pot_adrenaline", "pot_secondwind", "pot_berserker", "pot_fury", "stone_ember", "stone_storm",
    "treat_bone", "treat_snack", "treat_toy", "treat_feast", "treat_golden", "treat_kibble",
    "spin_lucky_coin",
];

// --- Boss-fight hooks (read by boss.js) -------------------------------------------------------------

export async function memberDamageMult(buyerId) {
    if (!buyerId) return 1;
    const rows = await db.query(`SELECT magnitude FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'damage' AND expires_at > NOW()`, [buyerId]).catch(() => []);
    return rows.reduce((m, r) => m * (Number(r.magnitude) || 1), 1);
}

export async function memberBonusStrikes(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT COALESCE(SUM(magnitude), 0)::int AS n FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'strikes' AND expires_at > NOW()`, [buyerId]).catch(() => null);
    return row?.n || 0;
}

export async function activeBoosts(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT kind, magnitude, expires_at FROM mkt_user_boost WHERE buyer_id = $1 AND expires_at > NOW() ORDER BY expires_at ASC`, [buyerId]).catch(() => []);
    return rows.map((r) => ({
        kind: r.kind,
        magnitude: Number(r.magnitude),
        expiresAt: r.expires_at,
        label: r.kind === "damage" ? `${Number(r.magnitude)}× damage` : `+${Number(r.magnitude)} attacks today`,
    }));
}

// --- Stash + shop -----------------------------------------------------------------------------------

export async function listConsumables(buyerId) {
    if (!buyerId) return { gold: 0, shop: [], stash: [], chargedItems: [], active: [] };
    const [goldRow, ownRows, chargedRows, active] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        activeBoosts(buyerId),
    ]);
    const gold = goldRow?.gold || 0;
    const shop = SHOP_ORDER.filter((id) => CONSUMABLES[id]?.price != null).map((id) => {
        const c = CONSUMABLES[id];
        return { id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, price: c.price, canAfford: gold >= c.price };
    });
    const stash = ownRows.map((r) => {
        const c = CONSUMABLES[r.consumable_id];
        if (!c) return null;
        return { id: r.consumable_id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, count: r.count, target: c.target || null };
    }).filter(Boolean);
    // The member's charged gear, for the recharge / cooldown-reset target pickers.
    const now = Date.now();
    const chargedItems = chargedRows.map((r) => {
        const def = itemById(r.item_id);
        if (!def?.charged) return null;
        const left = Math.max(0, r.charges_left ?? 0);
        const cd = Math.max(0, def.cooldownDays || 0);
        const readyAt = r.last_charge_at ? new Date(r.last_charge_at).getTime() + cd * 86400000 : 0;
        const onCooldown = left > 0 && readyAt > now;
        return { id: def.id, name: def.name, icon: def.icon, rarity: def.rarity, chargesLeft: left, maxCharges: def.charges || 0, full: left >= (def.charges || 0), onCooldown, cooldownUntil: onCooldown ? new Date(readyAt).toISOString() : null };
    }).filter(Boolean);
    return { gold, shop, stash, chargedItems, active };
}

// Grant a consumable (chest drop / owner). Best-effort.
export async function grantConsumable(buyerId, id, n = 1) {
    if (!buyerId || !CONSUMABLES[id]) return;
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + $3`,
        [buyerId, id, n]
    ).catch(() => {});
}

export async function buyConsumable(buyerId, id) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c || c.price == null) return { ok: false, error: "not_for_sale" };
    const cp = await previewShopCoupon(buyerId, c.price); // apply a login coupon if one's active
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cp.price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    if (cp.pct > 0) await consumeShopCoupon(buyerId);
    await grantConsumable(buyerId, id, 1);
    await trackActivity(buyerId, "buy_consumable", { id, name: c.name, couponPct: cp.pct || 0 });
    return { ok: true, gold: row.gold, couponPct: cp.pct || 0 };
}

// Use one from the stash. Targeted relics (recharge / reset) take a charged item id; validated BEFORE the
// consumable is spent so a bad target never wastes it.
export async function useConsumable(buyerId, id, targetItemId = null) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    const e = c.effect;

    if (e.type === "recharge" || e.type === "reset_cooldown") {
        const def = itemById(targetItemId);
        if (!def?.charged) return { ok: false, error: "bad_target" };
        const row = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => null);
        if (!row) return { ok: false, error: "target_not_owned" };
        if (e.type === "recharge") {
            if ((row.charges_left ?? 0) >= (def.charges || 0)) return { ok: false, error: "already_full" };
        } else {
            const cd = Math.max(0, def.cooldownDays || 0);
            const readyAt = row.last_charge_at ? new Date(row.last_charge_at).getTime() + cd * 86400000 : 0;
            if (!((row.charges_left ?? 0) > 0 && readyAt > Date.now())) return { ok: false, error: "not_on_cooldown" };
        }
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        await trackActivity(buyerId, "use_consumable", { id, name: c.name });
        if (e.type === "recharge") {
            await db.query(`UPDATE mkt_user_item SET charges_left = $3 WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId, def.charges || 0]).catch(() => {});
            return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} fully recharged — ${def.charges} charges` };
        }
        await db.query(`UPDATE mkt_user_item SET last_charge_at = NULL WHERE buyer_id = $1 AND item_id = $2`, [buyerId, targetItemId]).catch(() => {});
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied: `${def.name} cooldown reset — ready to redeem now` };
    }

    // Pet treats feed the EQUIPPED pet — validate one's equipped BEFORE spending so a treat is never wasted.
    if (e.type === "pet_xp" || e.type === "pet_level") {
        const buyer = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        const petId = buyer?.featured_collectible;
        if (!petId) return { ok: false, error: "no_pet_equipped" };
        const petName = collectibleById(petId)?.name || "your pet";
        const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
        if (!dec) return { ok: false, error: "none_owned" };
        let res;
        if (e.type === "pet_level") {
            res = await levelUpEquippedPet(buyerId).catch(() => ({ ok: false }));
        } else {
            res = await addEquippedPetXp(buyerId, e.amount).catch(() => ({ ok: false }));
        }
        await trackActivity(buyerId, "use_consumable", { id, name: c.name, petId }).catch(() => {});
        const leveled = e.type === "pet_level" ? Boolean(res?.ok) : Boolean(res?.leveled);
        const applied = e.type === "pet_level"
            ? (res?.ok ? `${petName} leveled up to Lv ${res.level}! ⬆️` : `${petName} is already max level`)
            : `+${e.amount.toLocaleString()} pet XP to ${petName}${res?.leveled ? ` — Lv ${res.level}! ⬆️` : ""}`;
        // Structured level-up payload so the client can fire the full celebration (not a tiny text line).
        const petLevelUp = leveled ? { petId, petName, level: res.level, rarity: collectibleById(petId)?.rarity || "common", maxed: res.level >= 5 } : null;
        return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied, petLevelUp, petXpGain: e.type === "pet_xp" ? e.amount : null };
    }

    const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
    if (!dec) return { ok: false, error: "none_owned" };
    let applied = "";
    if (e.type === "spin_token") {
        await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, e.amount]).catch(() => {});
        applied = `+${e.amount} wheel spin${e.amount > 1 ? "s" : ""}`;
    } else if (e.type === "spin_reset") {
        await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
        applied = "free daily spin refreshed — spin again!";
    } else if (e.type === "xp") {
        await awardXp(buyerId, "consumable", { points: e.amount, meta: { consumable: id } }).catch(() => {});
        applied = `+${e.amount.toLocaleString()} XP`;
    } else if (e.type === "strikes") {
        // Expire at the next STORE-LOCAL (America/Chicago) midnight — the same boundary the boss swing counter
        // resets on. Using UTC midnight let an evening-bought potion stay active past the Chicago-day rollover,
        // so its bonus strikes counted toward TWO days ("+N today" applied twice). Align them so it's one day.
        await db.query(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at)
             VALUES ($1, 'strikes', $2, (date_trunc('day', NOW() AT TIME ZONE 'America/Chicago') + interval '1 day') AT TIME ZONE 'America/Chicago')`,
            [buyerId, e.amount]
        ).catch(() => {});
        applied = `+${e.amount} boss attacks today`;
    } else if (e.type === "damage") {
        await db.query(`INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'damage', $2, NOW() + ($3 || ' hours')::interval)`, [buyerId, e.mult, String(e.hours)]).catch(() => {});
        applied = `${e.mult}× boss damage for ${e.hours}h`;
    }
    return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
}
