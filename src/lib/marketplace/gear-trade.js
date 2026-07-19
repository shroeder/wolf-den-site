import "server-only";

import { db } from "@/lib/db";
import { itemById, itemIcon } from "@/lib/marketplace/items.js";
import { recordGift } from "@/lib/marketplace/gifts.js";

// Member-to-member gear trading: offer your un-equipped items and/or gold for one of another member's
// un-equipped items. Charged (real-world perk) items are never tradeable.

function itemView(id) {
    const d = itemById(id);
    if (!d) return null;
    return { id: d.id, name: d.name, rarity: d.rarity, slot: d.slot, icon: d.icon };
}

// Does the member own this item AND have it un-equipped? (equipped items can't be traded away)
async function ownsUnequipped(buyerId, itemId) {
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owned) return false;
    const eq = await db.queryOne(`SELECT 1 FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    return !eq;
}
const owns = async (buyerId, itemId) => Boolean(await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null));

async function nameOf(buyerId) {
    const r = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return r?.display_name || r?.alias || "A member";
}

// The member's own un-equipped, non-charged items (+ gold) — the pool they can offer in a trade.
export async function tradeableItems(buyerId) {
    if (!buyerId) return { items: [], gold: 0 };
    const [rows, equippedRows, goldRow] = await Promise.all([
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id FROM mkt_user_equipment WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const equipped = new Set(equippedRows.map((r) => r.item_id));
    const items = rows
        .map((r) => r.item_id)
        .filter((id) => !equipped.has(id) && !itemById(id)?.charged)
        .map(itemView)
        .filter(Boolean);
    return { items, gold: goldRow?.gold || 0 };
}

// Propose a trade. Returns { ok, id } or { ok:false, error }.
export async function proposeGearTrade(proposerId, targetId, requestedItemId, offeredItemIds = [], offeredGold = 0) {
    if (!proposerId || !targetId) return { ok: false, error: "missing" };
    if (proposerId === targetId) return { ok: false, error: "self" };
    const reqDef = itemById(requestedItemId);
    if (!reqDef) return { ok: false, error: "bad_item" };
    if (reqDef.charged) return { ok: false, error: "not_tradeable" };
    if (!(await ownsUnequipped(targetId, requestedItemId))) return { ok: false, error: "target_missing" };
    if (await owns(proposerId, requestedItemId)) return { ok: false, error: "already_own" };

    const items = [...new Set((offeredItemIds || []).map((x) => String(x)))].slice(0, 8);
    for (const id of items) {
        const d = itemById(id);
        if (!d || d.charged) return { ok: false, error: "bad_offer" };
        if (!(await ownsUnequipped(proposerId, id))) return { ok: false, error: "offer_missing" };
        if (await owns(targetId, id)) return { ok: false, error: "target_has_offer" };
    }
    const gold = Math.max(0, Math.floor(Number(offeredGold) || 0));
    if (!items.length && gold <= 0) return { ok: false, error: "empty_offer" };
    if (gold > 0) {
        const g = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [proposerId]).catch(() => null);
        if ((g?.gold || 0) < gold) return { ok: false, error: "not_enough_gold" };
    }
    // Collapse any duplicate still-pending offer for the same item between these two members.
    await db.query(`UPDATE mkt_gear_trade SET status = 'cancelled', resolved_at = NOW() WHERE proposer_id = $1 AND target_id = $2 AND requested_item_id = $3 AND status = 'pending'`, [proposerId, targetId, requestedItemId]).catch(() => {});
    const row = await db.queryOne(
        `INSERT INTO mkt_gear_trade (proposer_id, target_id, requested_item_id, offered_item_ids, offered_gold) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [proposerId, targetId, requestedItemId, JSON.stringify(items), gold]
    ).catch(() => null);
    if (!row) return { ok: false, error: "failed" };
    await recordGift(targetId, { kind: "item", title: "🤝 Trade offer!", body: `${await nameOf(proposerId)} wants to trade for your ${reqDef.name}. Tap to review.`, icon: "🤝", url: "/marketplace/inventory#trades" }).catch(() => {});
    return { ok: true, id: row.id };
}

// Pending trades that involve the member (incoming + outgoing), resolved for display.
export async function listGearTrades(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT * FROM mkt_gear_trade WHERE (target_id = $1 OR proposer_id = $1) AND status = 'pending' ORDER BY created_at DESC LIMIT 50`, [buyerId]).catch(() => []);
    const out = [];
    for (const r of rows) {
        const offered = Array.isArray(r.offered_item_ids) ? r.offered_item_ids : JSON.parse(r.offered_item_ids || "[]");
        const incoming = r.target_id === buyerId;
        out.push({
            id: r.id,
            direction: incoming ? "incoming" : "outgoing",
            withName: await nameOf(incoming ? r.proposer_id : r.target_id),
            requested: itemView(r.requested_item_id),
            offered: offered.map(itemView).filter(Boolean),
            gold: r.offered_gold,
            createdAt: r.created_at,
        });
    }
    return out;
}

// Accept / decline (target) or cancel (proposer). Accept re-validates then swaps atomically.
export async function respondGearTrade(buyerId, tradeId, action) {
    const t = await db.queryOne(`SELECT * FROM mkt_gear_trade WHERE id = $1`, [tradeId]).catch(() => null);
    if (!t || t.status !== "pending") return { ok: false, error: "not_pending" };
    const cancel = async (reason) => { await db.query(`UPDATE mkt_gear_trade SET status = 'cancelled', resolved_at = NOW() WHERE id = $1`, [tradeId]).catch(() => {}); return { ok: false, error: reason }; };

    if (action === "cancel") {
        if (t.proposer_id !== buyerId) return { ok: false, error: "forbidden" };
        await db.query(`UPDATE mkt_gear_trade SET status = 'cancelled', resolved_at = NOW() WHERE id = $1`, [tradeId]).catch(() => {});
        return { ok: true };
    }
    if (t.target_id !== buyerId) return { ok: false, error: "forbidden" };
    if (action === "decline") {
        await db.query(`UPDATE mkt_gear_trade SET status = 'declined', resolved_at = NOW() WHERE id = $1`, [tradeId]).catch(() => {});
        await recordGift(t.proposer_id, { kind: "item", title: "Trade declined", body: `${await nameOf(t.target_id)} declined your trade for ${itemById(t.requested_item_id)?.name || "an item"}.`, icon: "🤝", url: "/marketplace/inventory#trades" }).catch(() => {});
        return { ok: true };
    }
    if (action !== "accept") return { ok: false, error: "bad_action" };

    // Re-validate the whole swap is still legal, else void it.
    const offered = Array.isArray(t.offered_item_ids) ? t.offered_item_ids : JSON.parse(t.offered_item_ids || "[]");
    if (!(await ownsUnequipped(t.target_id, t.requested_item_id))) return cancel("you_no_longer_own");
    if (await owns(t.proposer_id, t.requested_item_id)) return cancel("stale");
    for (const id of offered) {
        if (!(await ownsUnequipped(t.proposer_id, id))) return cancel("proposer_stale");
        if (await owns(t.target_id, id)) return cancel("you_already_have");
    }
    if (t.offered_gold > 0) {
        const g = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [t.proposer_id]).catch(() => null);
        if ((g?.gold || 0) < t.offered_gold) return cancel("proposer_broke");
    }

    // Execute: requested item target→proposer, offered items proposer→target, gold proposer→target.
    await db.query(`UPDATE mkt_user_item SET buyer_id = $1, acquired_via = 'trade' WHERE buyer_id = $2 AND item_id = $3`, [t.proposer_id, t.target_id, t.requested_item_id]).catch(() => {});
    for (const id of offered) {
        await db.query(`UPDATE mkt_user_item SET buyer_id = $1, acquired_via = 'trade' WHERE buyer_id = $2 AND item_id = $3`, [t.target_id, t.proposer_id, id]).catch(() => {});
    }
    if (t.offered_gold > 0) {
        await db.query(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1`, [t.proposer_id, t.offered_gold]).catch(() => {});
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [t.target_id, t.offered_gold]).catch(() => {});
    }
    await db.query(`UPDATE mkt_gear_trade SET status = 'accepted', resolved_at = NOW() WHERE id = $1`, [tradeId]).catch(() => {});
    await recordGift(t.proposer_id, { kind: "item", title: "🤝 Trade accepted!", body: `${await nameOf(t.target_id)} accepted — ${itemById(t.requested_item_id)?.name || "the item"} is now in your inventory!`, icon: "🎉", url: "/marketplace/inventory" }).catch(() => {});
    return { ok: true };
}
