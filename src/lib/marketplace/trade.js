import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";
import { sendWebPush } from "@/lib/push/web-push.js";

const MAX_SIDE = 12; // items per side, sanity cap

function cleanItemIds(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((x) => String(x || "").trim()).filter((id) => itemById(id)))].slice(0, MAX_SIDE);
}

async function ownedSet(buyerId, ids) {
    if (!ids.length) return new Set();
    const rows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1 AND item_id = ANY($2)`, [buyerId, ids]).catch(() => []);
    return new Set(rows.map((r) => r.item_id));
}

// Move an item (with its charge state) from one member to another; unequips it from the sender first.
async function moveItem(fromId, toId, itemId) {
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [fromId, itemId]).catch(() => {});
    const row = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING charges_left`, [fromId, itemId]).catch(() => null);
    if (!row) return false;
    await db.query(
        `INSERT INTO mkt_user_item (buyer_id, item_id, acquired_via, charges_left) VALUES ($1, $2, 'trade', $3) ON CONFLICT (buyer_id, item_id) DO NOTHING`,
        [toId, itemId, row.charges_left]
    ).catch(() => {});
    return true;
}

const bumpGear = (id) => db.query(`UPDATE mkt_buyer SET equipment_updated_at = NOW() WHERE id = $1`, [id]).catch(() => {});

// Propose a trade. Escrows the proposer's offered gold immediately; items are validated + moved at accept.
export async function proposeTrade(fromId, { toUserId, offeredItems, offeredGold, requestedItems, requestedGold, note } = {}) {
    const toId = String(toUserId || "").trim();
    if (!fromId || !toId || fromId === toId) return { ok: false, error: "invalid_target" };
    const oItems = cleanItemIds(offeredItems);
    const rItems = cleanItemIds(requestedItems);
    const oGold = Math.max(0, Math.floor(Number(offeredGold) || 0));
    const rGold = Math.max(0, Math.floor(Number(requestedGold) || 0));
    if (!oItems.length && !rItems.length && oGold === 0 && rGold === 0) return { ok: false, error: "empty_trade" };

    // Validate the proposer owns what they're offering, and the recipient owns what's requested.
    const [mine, theirs] = await Promise.all([ownedSet(fromId, oItems), ownedSet(toId, rItems)]);
    if (oItems.some((id) => !mine.has(id))) return { ok: false, error: "you_dont_own_offered" };
    if (rItems.some((id) => !theirs.has(id))) return { ok: false, error: "they_dont_own_requested" };

    // Escrow the offered gold (atomic — fails if they can't cover it).
    if (oGold > 0) {
        const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [fromId, oGold]).catch(() => null);
        if (!row) return { ok: false, error: "not_enough_gold" };
    }
    const offer = await db.queryOne(
        `INSERT INTO mkt_trade_offer (from_buyer_id, to_buyer_id, offered_items, offered_gold, requested_items, requested_gold, note)
         VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7) RETURNING id`,
        [fromId, toId, JSON.stringify(oItems), oGold, JSON.stringify(rItems), rGold, note ? String(note).slice(0, 300) : null]
    ).catch(() => null);
    if (offer) {
        // Ping the recipient so the offer doesn't sit unseen.
        const from = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [fromId]).catch(() => null);
        const label = from?.display_name || from?.alias || "A member";
        await sendWebPush(toId, {
            title: "🤝 New trade offer",
            body: `${label} wants to trade with you.`,
            url: "/marketplace/trade",
            tag: `trade-${offer.id}`,
            data: { type: "trade", offerId: offer.id },
        }).catch(() => {});
    }
    return offer ? { ok: true, offerId: offer.id } : { ok: false, error: "failed" };
}

// Count of the viewer's pending INCOMING offers (for the profile-hub unread badge).
export async function countIncomingTrades(userId) {
    if (!userId) return 0;
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_trade_offer WHERE to_buyer_id = $1 AND status = 'pending'`, [userId]).catch(() => null);
    return row?.n || 0;
}

async function loadPending(offerId) {
    return db.queryOne(`SELECT * FROM mkt_trade_offer WHERE id = $1 AND status = 'pending'`, [offerId]).catch(() => null);
}
const refund = (o) => (o.offered_gold > 0 ? db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [o.from_buyer_id, o.offered_gold]).catch(() => {}) : Promise.resolve());

// Recipient accepts or declines. Cancel is the proposer's version (see cancelTrade).
export async function respondTrade(userId, offerId, action) {
    const o = await loadPending(offerId);
    if (!o || o.to_buyer_id !== userId) return { ok: false, error: "not_found" };
    if (new Date(o.expires_at) < new Date()) {
        await db.query(`UPDATE mkt_trade_offer SET status='expired', resolved_at=NOW() WHERE id=$1`, [offerId]);
        await refund(o);
        return { ok: false, error: "expired" };
    }

    if (action === "decline") {
        await db.query(`UPDATE mkt_trade_offer SET status='declined', resolved_at=NOW() WHERE id=$1`, [offerId]);
        await refund(o);
        return { ok: true, status: "declined" };
    }

    // Accept: re-validate both sides still hold up, then swap.
    const offeredItems = Array.isArray(o.offered_items) ? o.offered_items : [];
    const requestedItems = Array.isArray(o.requested_items) ? o.requested_items : [];
    const [mineStill, theirsStill] = await Promise.all([ownedSet(o.from_buyer_id, offeredItems), ownedSet(userId, requestedItems)]);
    if (offeredItems.some((id) => !mineStill.has(id))) return { ok: false, error: "offer_no_longer_valid" };
    if (requestedItems.some((id) => !theirsStill.has(id))) return { ok: false, error: "you_no_longer_own_requested" };

    // Recipient pays their requested gold (atomic). Proposer's offered gold is already escrowed.
    if (o.requested_gold > 0) {
        const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [userId, o.requested_gold]).catch(() => null);
        if (!row) return { ok: false, error: "you_lack_gold" };
    }
    // Move items both ways.
    for (const id of offeredItems) await moveItem(o.from_buyer_id, userId, id);
    for (const id of requestedItems) await moveItem(userId, o.from_buyer_id, id);
    // Settle gold: recipient receives the escrowed offered gold; proposer receives the requested gold.
    if (o.offered_gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [userId, o.offered_gold]);
    if (o.requested_gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [o.from_buyer_id, o.requested_gold]);
    await db.query(`UPDATE mkt_trade_offer SET status='accepted', resolved_at=NOW() WHERE id=$1`, [offerId]);
    await Promise.all([bumpGear(o.from_buyer_id), bumpGear(userId)]);
    return { ok: true, status: "accepted" };
}

// Proposer cancels their own pending offer (refunds the escrow).
export async function cancelTrade(userId, offerId) {
    const o = await loadPending(offerId);
    if (!o || o.from_buyer_id !== userId) return { ok: false, error: "not_found" };
    await db.query(`UPDATE mkt_trade_offer SET status='cancelled', resolved_at=NOW() WHERE id=$1`, [offerId]);
    await refund(o);
    return { ok: true, status: "cancelled" };
}

// Decorate an offer's item ids with names/rarity/icons for display.
function decorate(ids) {
    return (Array.isArray(ids) ? ids : []).map((id) => {
        const d = itemById(id);
        return d ? { id: d.id, name: d.name, rarity: d.rarity, icon: d.icon } : { id, name: id, rarity: "common", icon: null };
    });
}

// The viewer's incoming + outgoing pending offers, with the other party's public label.
export async function listTrades(userId) {
    if (!userId) return { incoming: [], outgoing: [] };
    const rows = await db
        .query(
            `SELECT t.*, bf.display_name AS from_name, bf.alias AS from_alias, bt.display_name AS to_name, bt.alias AS to_alias
               FROM mkt_trade_offer t
               JOIN mkt_buyer bf ON bf.id = t.from_buyer_id
               JOIN mkt_buyer bt ON bt.id = t.to_buyer_id
              WHERE t.status = 'pending' AND (t.from_buyer_id = $1 OR t.to_buyer_id = $1)
              ORDER BY t.created_at DESC LIMIT 50`,
            [userId]
        )
        .catch(() => []);
    const map = (r) => ({
        id: r.id,
        from: { id: r.from_buyer_id, label: r.from_name || r.from_alias || "Member", alias: r.from_alias },
        to: { id: r.to_buyer_id, label: r.to_name || r.to_alias || "Member", alias: r.to_alias },
        offeredItems: decorate(r.offered_items), offeredGold: r.offered_gold,
        requestedItems: decorate(r.requested_items), requestedGold: r.requested_gold,
        note: r.note || null, expiresAt: r.expires_at,
    });
    return {
        incoming: rows.filter((r) => r.to_buyer_id === userId).map(map),
        outgoing: rows.filter((r) => r.from_buyer_id === userId).map(map),
    };
}
