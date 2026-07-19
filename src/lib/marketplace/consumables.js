import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";

// CONSUMABLES — one-shot boosts you buy with gold and use from your stash (not equipped). Three flavors:
// potions (temporary boss buffs), scrolls (instant XP), and magic stones (boss buffs, a bit cheaper/shorter).
// Effect types the boss fight understands:
//   xp      → instant XP
//   strikes → +N boss attacks TODAY (expires at end of day)
//   damage  → ×mult boss damage for `hours` (applies to your manual strikes)
export const CONSUMABLES = {
    scroll_wisdom: { name: "Tome of Wisdom", emoji: "📜", kind: "scroll", desc: "Instantly gain 500 XP.", price: 1500, effect: { type: "xp", amount: 500 } },
    scroll_ancient: { name: "Ancient Codex", emoji: "📖", kind: "scroll", desc: "Instantly gain 2,000 XP.", price: 5000, effect: { type: "xp", amount: 2000 } },
    pot_adrenaline: { name: "Adrenaline Vial", emoji: "🧪", kind: "potion", desc: "Gain +2 boss attacks today.", price: 1200, effect: { type: "strikes", amount: 2 } },
    pot_secondwind: { name: "Second Wind", emoji: "🌀", kind: "potion", desc: "Gain +5 boss attacks today.", price: 3200, effect: { type: "strikes", amount: 5 } },
    pot_berserker: { name: "Berserker's Brew", emoji: "🍺", kind: "potion", desc: "DOUBLE your boss damage for 24 hours.", price: 4000, effect: { type: "damage", mult: 2, hours: 24 } },
    pot_fury: { name: "Bottled Fury", emoji: "🔥", kind: "potion", desc: "TRIPLE your boss damage for 6 hours.", price: 6500, effect: { type: "damage", mult: 3, hours: 6 } },
    stone_ember: { name: "Ember Stone", emoji: "🔴", kind: "stone", desc: "DOUBLE your boss damage for 12 hours.", price: 3500, effect: { type: "damage", mult: 2, hours: 12 } },
    stone_storm: { name: "Storm Crystal", emoji: "🔷", kind: "stone", desc: "Gain +3 boss attacks today.", price: 2000, effect: { type: "strikes", amount: 3 } },
};

const CONSUMABLE_ORDER = ["scroll_wisdom", "scroll_ancient", "pot_adrenaline", "pot_secondwind", "pot_berserker", "pot_fury", "stone_ember", "stone_storm"];

// --- Boss-fight hooks (read by boss.js) -------------------------------------------------------------

// Product of active 'damage' boost multipliers for a member (1 = none). Applied to their manual strikes.
export async function memberDamageMult(buyerId) {
    if (!buyerId) return 1;
    const rows = await db.query(`SELECT magnitude FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'damage' AND expires_at > NOW()`, [buyerId]).catch(() => []);
    return rows.reduce((m, r) => m * (Number(r.magnitude) || 1), 1);
}

// Sum of active 'strikes' boosts (extra boss attacks available today).
export async function memberBonusStrikes(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT COALESCE(SUM(magnitude), 0)::int AS n FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'strikes' AND expires_at > NOW()`, [buyerId]).catch(() => null);
    return row?.n || 0;
}

// Active boosts for display (a small banner on the boss/inventory screens).
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
    if (!buyerId) return { gold: 0, items: [], active: [] };
    const [goldRow, ownRows, active] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        activeBoosts(buyerId),
    ]);
    const gold = goldRow?.gold || 0;
    const owned = Object.fromEntries(ownRows.map((r) => [r.consumable_id, r.count]));
    const items = CONSUMABLE_ORDER.filter((id) => CONSUMABLES[id]).map((id) => {
        const c = CONSUMABLES[id];
        return { id, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc, price: c.price, owned: owned[id] || 0, canAfford: gold >= c.price };
    });
    return { gold, items, active };
}

// Buy one with gold (atomic deduction). Returns { ok, gold } or an error key.
export async function buyConsumable(buyerId, id) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, c.price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, 1)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + 1`,
        [buyerId, id]
    ).catch(() => {});
    return { ok: true, gold: row.gold };
}

// Use one from the stash (atomic decrement) and apply its effect. Returns a result the UI can celebrate.
export async function useConsumable(buyerId, id) {
    const c = CONSUMABLES[id];
    if (!buyerId || !c) return { ok: false, error: "unknown" };
    const dec = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [buyerId, id]).catch(() => null);
    if (!dec) return { ok: false, error: "none_owned" };

    const e = c.effect;
    let applied = "";
    if (e.type === "xp") {
        await awardXp(buyerId, "consumable", { points: e.amount, meta: { consumable: id } }).catch(() => {});
        applied = `+${e.amount.toLocaleString()} XP`;
    } else if (e.type === "strikes") {
        // Extra boss attacks that last until end of the day (matches the daily-attack reset).
        await db.query(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'strikes', $2, date_trunc('day', NOW()) + interval '1 day')`,
            [buyerId, e.amount]
        ).catch(() => {});
        applied = `+${e.amount} boss attacks today`;
    } else if (e.type === "damage") {
        await db.query(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'damage', $2, NOW() + ($3 || ' hours')::interval)`,
            [buyerId, e.mult, String(e.hours)]
        ).catch(() => {});
        applied = `${e.mult}× boss damage for ${e.hours}h`;
    }
    return { ok: true, remaining: dec.count, name: c.name, emoji: c.emoji, applied };
}
