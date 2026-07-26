import "server-only";

import { db } from "@/lib/db";
import { itemById, describeStats } from "@/lib/marketplace/items.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { logCoin } from "@/lib/marketplace/coins.js";

const MAX_SIDE = 12; // items per side, sanity cap

function cleanItemIds(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((x) => String(x || "").trim()).filter((id) => itemById(id)))].slice(0, MAX_SIDE);
}
function cleanPetIds(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((x) => String(x || "").trim()).filter((id) => collectibleById(id)))].slice(0, MAX_SIDE);
}

// The set of these pets a member OWNS (an unlock row, or an auto level-pet at/under their level).
async function ownedPetSet(buyerId, petIds) {
    if (!petIds.length) return new Set();
    const [rows, buyer] = await Promise.all([
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = ANY($2)`, [buyerId, petIds]).catch(() => []),
        db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const owned = new Set(rows.map((r) => r.ref));
    const level = levelForXp(buyer?.xp || 0).level;
    for (const id of petIds) {
        const def = collectibleById(id);
        if (def && def.source === "level" && level >= def.level) owned.add(id);
    }
    return owned;
}

// The subset that are EARNED (source !== 'level') AND still tradeable (unlock row tradeable=TRUE). Only these
// may be offered in a trade — level pets would just re-unlock for free, and a locked pet was already shared.
async function earnedTradeablePetSet(buyerId, petIds) {
    if (!petIds.length) return new Set();
    const rows = await db
        .query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND tradeable = TRUE AND ref = ANY($2)`, [buyerId, petIds])
        .catch(() => []);
    return new Set(rows.map((r) => r.ref).filter((id) => collectibleById(id)?.source !== "level"));
}

// Trade a pet the "share a copy, lock both" way: the receiver gets a FRESH Lv1 copy, the giver keeps theirs,
// and both copies become non-tradeable so the pet can never be farmed/laundered through repeated trades.
async function sharePetLockBoth(fromOwnerId, toReceiverId, petId) {
    const lock = (buyerId) =>
        db.query(
            `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref, tradeable) VALUES ($1, 'pet', $2, FALSE)
             ON CONFLICT (buyer_id, category, ref) DO UPDATE SET tradeable = FALSE`,
            [buyerId, petId]
        ).catch(() => {});
    await lock(toReceiverId); // receiver's fresh copy (no mkt_pet_level row → starts Lv1)
    await lock(fromOwnerId); // giver keeps it but it's now locked
}

// Is this pet already tied up in another PENDING offer on this owner's side?
async function petInPendingTrade(ownerId, petId) {
    const row = await db
        .queryOne(
            `SELECT 1 FROM mkt_trade_offer
              WHERE status = 'pending'
                AND ( (to_buyer_id = $1 AND requested_pets @> $2::jsonb)
                   OR (from_buyer_id = $1 AND offered_pets @> $2::jsonb) )
              LIMIT 1`,
            [ownerId, JSON.stringify([petId])]
        )
        .catch(() => null);
    return Boolean(row);
}

// ── Browse: a FLATTENED list of gear other members own but DON'T have equipped — each entry is one tradeable
// copy you can propose a trade for (links to /marketplace/trade/new?to=<alias>&want=<itemId>). Rarity-first.
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
export async function listTradeableItems(viewerId, { q = "", rarity = null, limit = 160 } = {}) {
    if (!viewerId) return [];
    const rows = await db.query(
        `SELECT ui.buyer_id, ui.item_id, b.display_name, b.alias
           FROM mkt_user_item ui
           JOIN mkt_buyer b ON b.id = ui.buyer_id
          WHERE ui.buyer_id <> $1
            AND b.alias IS NOT NULL AND b.alias <> ''
            AND NOT EXISTS (SELECT 1 FROM mkt_user_equipment e WHERE e.buyer_id = ui.buyer_id AND e.item_id = ui.item_id)
          LIMIT 1200`,
        [viewerId]
    ).catch(() => []);
    const spriteMap = await itemSpriteMap().catch(() => ({}));
    const query = String(q || "").trim().toLowerCase();
    const out = [];
    for (const r of rows) {
        const it = itemById(r.item_id);
        if (!it) continue;
        if (rarity && it.rarity !== rarity) continue;
        if (query && !it.name.toLowerCase().includes(query) && !(r.alias || "").toLowerCase().includes(query)) continue;
        out.push({
            itemId: r.item_id, name: it.name, rarity: it.rarity, slot: it.slot, stats: describeStats(it.stats),
            icon: it.icon, sprite: spriteMap[r.item_id] || null,
            ownerName: r.display_name || `@${r.alias}`, ownerAlias: r.alias,
        });
    }
    out.sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0) || a.name.localeCompare(b.name));
    return out.slice(0, limit);
}

async function ownedSet(buyerId, ids) {
    if (!ids.length) return new Set();
    const rows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1 AND item_id = ANY($2)`, [buyerId, ids]).catch(() => []);
    return new Set(rows.map((r) => r.item_id));
}

// Which of these item ids the member currently has EQUIPPED. An equipped piece must be unequipped before it
// can be offered in a trade (defense in depth — the UI disables equipped cards, this blocks any bypass).
async function equippedSet(buyerId, ids) {
    if (!ids.length) return new Set();
    const rows = await db.query(`SELECT item_id FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = ANY($2)`, [buyerId, ids]).catch(() => []);
    return new Set(rows.map((r) => r.item_id));
}

// Is a specific (owner, item) copy already locked in another PENDING offer — either requested from that
// owner or offered by them? Used to block duplicate/conflicting trades for the same piece. Returns the
// first conflicting item id, or null.
async function itemInPendingTrade(pairs) {
    for (const { ownerId, itemId } of pairs) {
        const row = await db
            .queryOne(
                `SELECT 1 FROM mkt_trade_offer
                  WHERE status = 'pending'
                    AND ( (to_buyer_id = $1 AND requested_items @> $2::jsonb)
                       OR (from_buyer_id = $1 AND offered_items @> $2::jsonb) )
                  LIMIT 1`,
                [ownerId, JSON.stringify([itemId])]
            )
            .catch(() => null);
        if (row) return itemId;
    }
    return null;
}

// Void every PENDING offer that involves this member's (now-gone) copy of an item — because they sold it,
// traded it, or shattered it. Refunds the proposer's escrowed gold on each. Call wherever an item leaves
// an account so stale offers can't be accepted and gold isn't left locked.
export async function voidPendingTradesForItem(buyerId, itemId) {
    if (!buyerId || !itemId) return;
    const rows = await db
        .query(
            `SELECT * FROM mkt_trade_offer
              WHERE status = 'pending'
                AND ( (to_buyer_id = $1 AND requested_items @> $2::jsonb)
                   OR (from_buyer_id = $1 AND offered_items @> $2::jsonb) )`,
            [buyerId, JSON.stringify([itemId])]
        )
        .catch(() => []);
    for (const o of rows) {
        const won = await db.queryOne(`UPDATE mkt_trade_offer SET status='void', resolved_at=NOW() WHERE id=$1 AND status='pending' RETURNING id`, [o.id]).catch(() => null);
        if (won) await refund(o);
    }
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
export async function proposeTrade(fromId, { toUserId, offeredItems, offeredGold, requestedItems, requestedGold, offeredPets, requestedPets, note } = {}) {
    const toId = String(toUserId || "").trim();
    if (!fromId || !toId || fromId === toId) return { ok: false, error: "invalid_target" };
    const oItems = cleanItemIds(offeredItems);
    const rItems = cleanItemIds(requestedItems);
    const oPets = cleanPetIds(offeredPets);
    const rPets = cleanPetIds(requestedPets);
    const oGold = Math.max(0, Math.floor(Number(offeredGold) || 0));
    const rGold = Math.max(0, Math.floor(Number(requestedGold) || 0));
    if (!oItems.length && !rItems.length && !oPets.length && !rPets.length && oGold === 0 && rGold === 0) return { ok: false, error: "empty_trade" };

    // Validate the proposer owns what they're offering, and the recipient owns what's requested.
    const [mine, theirs] = await Promise.all([ownedSet(fromId, oItems), ownedSet(toId, rItems)]);
    if (oItems.some((id) => !mine.has(id))) return { ok: false, error: "you_dont_own_offered" };
    if (rItems.some((id) => !theirs.has(id))) return { ok: false, error: "they_dont_own_requested" };

    // An equipped piece can't be offered — unequip it first (matches the UI, and blocks any client bypass).
    if (oItems.length) {
        const equipped = await equippedSet(fromId, oItems);
        const eqId = oItems.find((id) => equipped.has(id));
        if (eqId) return { ok: false, error: "item_equipped", itemName: itemById(eqId)?.name || eqId };
    }

    // Pets: offered must be MY earned+tradeable pets the recipient doesn't already own; requested must be
    // THEIR earned+tradeable pets I don't already own.
    if (oPets.length || rPets.length) {
        const [myPets, theirPets, iOwn, theyOwn] = await Promise.all([
            earnedTradeablePetSet(fromId, oPets),
            earnedTradeablePetSet(toId, rPets),
            ownedPetSet(fromId, rPets),
            ownedPetSet(toId, oPets),
        ]);
        if (oPets.some((id) => !myPets.has(id))) return { ok: false, error: "pet_not_tradeable" };
        if (rPets.some((id) => !theirPets.has(id))) return { ok: false, error: "their_pet_not_tradeable" };
        if (oPets.some((id) => theyOwn.has(id))) return { ok: false, error: "they_already_own_pet" };
        if (rPets.some((id) => iOwn.has(id))) return { ok: false, error: "you_already_own_pet" };
    }

    // Block duplicate/conflicting requests — no item may be tangled in two pending trades at once (e.g.
    // requesting a piece someone's already got a pending offer on, or re-offering one you already offered).
    const conflict = await itemInPendingTrade([
        ...oItems.map((id) => ({ ownerId: fromId, itemId: id })),
        ...rItems.map((id) => ({ ownerId: toId, itemId: id })),
    ]);
    if (conflict) {
        const d = itemById(conflict);
        return { ok: false, error: "item_in_pending_trade", itemName: d?.name || conflict };
    }
    for (const id of oPets) if (await petInPendingTrade(fromId, id)) return { ok: false, error: "pet_in_pending_trade", itemName: collectibleById(id)?.name || id };
    for (const id of rPets) if (await petInPendingTrade(toId, id)) return { ok: false, error: "pet_in_pending_trade", itemName: collectibleById(id)?.name || id };

    // Escrow the offered gold (atomic — fails if they can't cover it).
    if (oGold > 0) {
        const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [fromId, oGold]).catch(() => null);
        if (!row) return { ok: false, error: "not_enough_gold" };
        await logCoin(fromId, -oGold, "trade_escrow", { balanceAfter: row.gold }).catch(() => {});
    }
    const offer = await db.queryOne(
        `INSERT INTO mkt_trade_offer (from_buyer_id, to_buyer_id, offered_items, offered_gold, requested_items, requested_gold, offered_pets, requested_pets, note)
         VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9) RETURNING id`,
        [fromId, toId, JSON.stringify(oItems), oGold, JSON.stringify(rItems), rGold, JSON.stringify(oPets), JSON.stringify(rPets), note ? String(note).slice(0, 300) : null]
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
        await trackActivity(fromId, "trade_propose", { toId, offerId: offer.id, giveItems: oItems.length, giveGold: oGold, givePets: oPets.length, getItems: rItems.length, getGold: rGold, getPets: rPets.length });
    }
    return offer ? { ok: true, offerId: offer.id } : { ok: false, error: "failed" };
}

// Lazy decay (no cron): expire this member's past-due pending offers + refund the escrow. Called whenever
// trades are listed/counted, so stale offers clear and locked gold is returned without a scheduled job.
async function sweepExpired(userId) {
    if (!userId) return;
    const rows = await db
        .query(`SELECT * FROM mkt_trade_offer WHERE status='pending' AND expires_at < NOW() AND (from_buyer_id=$1 OR to_buyer_id=$1)`, [userId])
        .catch(() => []);
    for (const o of rows) {
        const won = await db.queryOne(`UPDATE mkt_trade_offer SET status='expired', resolved_at=NOW() WHERE id=$1 AND status='pending' RETURNING id`, [o.id]).catch(() => null);
        if (won) await refund(o);
    }
}

// Count of the viewer's pending INCOMING offers (for the profile-hub unread badge).
export async function countIncomingTrades(userId) {
    if (!userId) return 0;
    await sweepExpired(userId);
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_trade_offer WHERE to_buyer_id = $1 AND status = 'pending'`, [userId]).catch(() => null);
    return row?.n || 0;
}

async function loadPending(offerId) {
    return db.queryOne(`SELECT * FROM mkt_trade_offer WHERE id = $1 AND status = 'pending'`, [offerId]).catch(() => null);
}
const refund = (o) => (o.offered_gold > 0 ? (logCoin(o.from_buyer_id, o.offered_gold, "trade_refund", { meta: { offerId: o.id } }).catch(() => {}), db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [o.from_buyer_id, o.offered_gold]).catch(() => {})) : Promise.resolve());

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
    // If either side no longer holds what they committed (sold/traded/shattered since), void the stale
    // offer and refund the escrow instead of leaving it dangling.
    if (offeredItems.some((id) => !mineStill.has(id))) {
        await db.query(`UPDATE mkt_trade_offer SET status='void', resolved_at=NOW() WHERE id=$1 AND status='pending'`, [offerId]).catch(() => {});
        await refund(o);
        return { ok: false, error: "offer_no_longer_valid" };
    }
    if (requestedItems.some((id) => !theirsStill.has(id))) {
        await db.query(`UPDATE mkt_trade_offer SET status='void', resolved_at=NOW() WHERE id=$1 AND status='pending'`, [offerId]).catch(() => {});
        await refund(o);
        return { ok: false, error: "you_no_longer_own_requested" };
    }

    // Pets: re-validate they're still each side's earned+tradeable pet the other doesn't already own.
    const offeredPets = Array.isArray(o.offered_pets) ? o.offered_pets : [];
    const requestedPets = Array.isArray(o.requested_pets) ? o.requested_pets : [];
    if (offeredPets.length || requestedPets.length) {
        const [oStill, rStill, recipientHas, proposerHas] = await Promise.all([
            earnedTradeablePetSet(o.from_buyer_id, offeredPets),
            earnedTradeablePetSet(userId, requestedPets),
            ownedPetSet(userId, offeredPets),
            ownedPetSet(o.from_buyer_id, requestedPets),
        ]);
        const bad =
            offeredPets.some((id) => !oStill.has(id) || recipientHas.has(id)) ||
            requestedPets.some((id) => !rStill.has(id) || proposerHas.has(id));
        if (bad) {
            await db.query(`UPDATE mkt_trade_offer SET status='void', resolved_at=NOW() WHERE id=$1 AND status='pending'`, [offerId]).catch(() => {});
            await refund(o);
            return { ok: false, error: "pet_no_longer_valid" };
        }
    }

    // Recipient pays their requested gold (atomic). Proposer's offered gold is already escrowed.
    if (o.requested_gold > 0) {
        const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [userId, o.requested_gold]).catch(() => null);
        if (!row) return { ok: false, error: "you_lack_gold" };
        await logCoin(userId, -o.requested_gold, "trade", { meta: { offerId }, balanceAfter: row.gold }).catch(() => {});
    }
    // Move items both ways.
    for (const id of offeredItems) await moveItem(o.from_buyer_id, userId, id);
    for (const id of requestedItems) await moveItem(userId, o.from_buyer_id, id);
    // Share pets both ways (receiver gets a fresh Lv1 copy; both copies become non-tradeable).
    for (const id of offeredPets) await sharePetLockBoth(o.from_buyer_id, userId, id);
    for (const id of requestedPets) await sharePetLockBoth(userId, o.from_buyer_id, id);
    // Settle gold: recipient receives the escrowed offered gold; proposer receives the requested gold.
    if (o.offered_gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [userId, o.offered_gold]);
    if (o.offered_gold > 0) await logCoin(userId, o.offered_gold, "trade", { meta: { offerId } }).catch(() => {});
    if (o.requested_gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [o.from_buyer_id, o.requested_gold]);
    if (o.requested_gold > 0) await logCoin(o.from_buyer_id, o.requested_gold, "trade", { meta: { offerId } }).catch(() => {});
    await db.query(`UPDATE mkt_trade_offer SET status='accepted', resolved_at=NOW() WHERE id=$1`, [offerId]);
    // The swapped items just changed hands — void any OTHER pending offers that referenced them.
    for (const id of offeredItems) await voidPendingTradesForItem(o.from_buyer_id, id);
    for (const id of requestedItems) await voidPendingTradesForItem(userId, id);
    await Promise.all([bumpGear(o.from_buyer_id), bumpGear(userId)]);
    await trackActivity(userId, "trade_accept", { offerId, from: o.from_buyer_id, giveItems: offeredItems.length, giveGold: o.offered_gold, givePets: offeredPets.length, getItems: requestedItems.length, getGold: o.requested_gold, getPets: requestedPets.length });
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
function decoratePets(ids) {
    return (Array.isArray(ids) ? ids : []).map((id) => {
        const d = collectibleById(id);
        return d ? { id: d.id, name: d.name, rarity: d.rarity } : { id, name: id, rarity: "common" };
    });
}

// The viewer's incoming + outgoing pending offers, with the other party's public label.
export async function listTrades(userId) {
    if (!userId) return { incoming: [], outgoing: [] };
    await sweepExpired(userId);
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
        offeredPets: decoratePets(r.offered_pets), requestedPets: decoratePets(r.requested_pets),
        note: r.note || null, expiresAt: r.expires_at,
    });
    return {
        incoming: rows.filter((r) => r.to_buyer_id === userId).map(map),
        outgoing: rows.filter((r) => r.from_buyer_id === userId).map(map),
    };
}
