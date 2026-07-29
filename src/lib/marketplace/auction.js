import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { itemById, describeStats } from "@/lib/marketplace/items.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { grantItem, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { transferItemEnhancement, enhanceDetailsFor } from "@/lib/marketplace/crafting.js";

// Merge base item stats with a forge stat-bonus into effective totals.
function mergeStats(base = {}, bonus = {}) {
    const m = { ...(base || {}) };
    for (const [k, v] of Object.entries(bonus || {})) m[k] = (m[k] || 0) + (Number(v) || 0);
    return m;
}

// ── THE AUCTION HOUSE ───────────────────────────────────────────────────────────────────────────────────────
// Members list unused gear at a gold price; anyone can browse + buy. Owner-gated during the Town build. A 5%
// listing fee (paid up front) is the gold sink; listings run 1/3/5/7 days. Listing removes the item from your
// inventory; a sale grants it to the buyer + pays you the gold; an expiry or cancel returns the item to you.
export const LIST_FEE_PCT = 0.05;
export const DURATIONS = [1, 3, 5, 7];
const MIN_PRICE = 10;
const MAX_PRICE = 10_000_000;
export const listingFee = (price) => Math.max(1, Math.ceil((Number(price) || 0) * LIST_FEE_PCT));

// A public shape for one listing (item meta merged in). `me`/`owned` are viewer-relative.
function shapeListing(row, sprites, viewerId, ownedSet, enhMap) {
    const it = itemById(row.item_id);
    if (!it) return null;
    const det = enhMap && enhMap.get(`${row.seller_id}|${row.item_id}`);
    const bonus = det?.bonus || null;
    return {
        id: Number(row.id),
        itemId: row.item_id,
        name: it.name, rarity: it.rarity, slot: it.slot || "misc", icon: it.icon || null,
        stats: describeStats(mergeStats(it.stats || {}, bonus || {})) || null, // effective (base + forge) totals
        forgeStats: bonus && Object.keys(bonus).length ? describeStats(bonus) : null, // the forge bonus alone
        sprite: sprites[row.item_id] || null,
        enhanceLevel: det?.level || 0,
        price: Number(row.price),
        sellerId: row.seller_id,
        sellerName: row.display_name || (row.alias ? `@${row.alias}` : "A wolf"),
        sellerAlias: row.alias || null,
        listedAt: row.listed_at,
        expiresAt: row.expires_at,
        mine: viewerId && row.seller_id === viewerId,
        owned: ownedSet.has(row.item_id), // viewer already owns this item (can't buy a duplicate)
    };
}

// Lazily expire any past-due active listings, returning each item to its seller. Idempotent (status guard).
export async function expireAuctions() {
    const due = await db.query(`UPDATE mkt_auction SET status = 'expired' WHERE status = 'active' AND expires_at < NOW() RETURNING seller_id, item_id`, []).catch(() => []);
    for (const r of due) await grantItem(r.seller_id, r.item_id, "auction_return").catch(() => {});
}

// The items a member CAN list right now: owned, not equipped, not already up for auction. With meta for the picker.
export async function getSellableItems(buyerId) {
    if (!buyerId) return [];
    const [owned, equipped, listed, sprites] = await Promise.all([
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getEquippedIds(buyerId).catch(() => ({})),
        db.query(`SELECT item_id FROM mkt_auction WHERE seller_id = $1 AND status = 'active'`, [buyerId]).catch(() => []),
        itemSpriteMap().catch(() => ({})),
    ]);
    const equippedSet = new Set(Object.values(equipped || {}));
    const listedSet = new Set(listed.map((r) => r.item_id));
    const sellableIds = owned.map((r) => r.item_id).filter((id) => !equippedSet.has(id) && !listedSet.has(id) && itemById(id));
    const enh = await enhanceDetailsFor(buyerId, sellableIds).catch(() => ({}));
    return sellableIds
        .map((id) => {
            const it = itemById(id);
            const bonus = enh[id]?.bonus || null;
            return { itemId: id, name: it.name, rarity: it.rarity, slot: it.slot || "misc", icon: it.icon || null, sprite: sprites[id] || null, stats: describeStats(mergeStats(it.stats || {}, bonus || {})) || null, forgeStats: bonus && Object.keys(bonus).length ? describeStats(bonus) : null, enhanceLevel: enh[id]?.level || 0 };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Browse the active market with search / filter / sort. `sort`: new | old | price_asc | price_desc.
export async function getAuctionListings(buyerId, { q = "", slot = "", rarity = "", sort = "new" } = {}) {
    await expireAuctions();
    const rows = await db.query(
        `SELECT a.id, a.seller_id, a.item_id, a.price, a.listed_at, a.expires_at, b.display_name, b.alias
           FROM mkt_auction a JOIN mkt_buyer b ON b.id = a.seller_id
          WHERE a.status = 'active' AND a.expires_at > NOW()
          ORDER BY a.listed_at DESC LIMIT 500`, []
    ).catch(() => []);
    const sprites = await itemSpriteMap().catch(() => ({}));
    const ownedSet = new Set(buyerId ? (await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id) : []);
    // Enhancement per (seller, item) so a listed enhanced piece shows "⚒️ +N" + its exact forge stats.
    const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    const enhRows = sellerIds.length ? await db.query(`SELECT buyer_id, item_id, level, stat_bonus FROM mkt_item_enhance WHERE buyer_id = ANY($1) AND item_id = ANY($2) AND level > 0`, [sellerIds, itemIds]).catch(() => []) : [];
    const enhMap = new Map(enhRows.map((e) => [`${e.buyer_id}|${e.item_id}`, { level: Number(e.level) || 0, bonus: (typeof e.stat_bonus === "string" ? (() => { try { return JSON.parse(e.stat_bonus); } catch { return {}; } })() : (e.stat_bonus || {})) }]));
    let out = rows.map((r) => shapeListing(r, sprites, buyerId, ownedSet, enhMap)).filter(Boolean);
    const needle = String(q || "").trim().toLowerCase();
    if (needle) out = out.filter((l) => l.name.toLowerCase().includes(needle) || l.sellerName.toLowerCase().includes(needle));
    if (slot) out = out.filter((l) => l.slot === slot);
    if (rarity) out = out.filter((l) => l.rarity === rarity);
    if (sort === "old") out.sort((a, b) => new Date(a.listedAt) - new Date(b.listedAt));
    else if (sort === "price_asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") out.sort((a, b) => b.price - a.price);
    // 'new' is already newest-first from the query order
    return out;
}

// A seller's own listings (active first, then recently ended).
export async function getMyListings(buyerId) {
    if (!buyerId) return [];
    await expireAuctions();
    const rows = await db.query(
        `SELECT a.id, a.seller_id, a.item_id, a.price, a.status, a.listed_at, a.expires_at, a.sold_at, b.display_name, b.alias
           FROM mkt_auction a JOIN mkt_buyer b ON b.id = a.seller_id
          WHERE a.seller_id = $1 AND (a.status = 'active' OR a.status IN ('sold','expired','cancelled') AND a.listed_at > NOW() - INTERVAL '7 days')
          ORDER BY (a.status = 'active') DESC, a.listed_at DESC LIMIT 100`, [buyerId]
    ).catch(() => []);
    const sprites = await itemSpriteMap().catch(() => ({}));
    return rows.map((r) => { const it = itemById(r.item_id); return it ? { id: Number(r.id), itemId: r.item_id, name: it.name, rarity: it.rarity, slot: it.slot || "misc", icon: it.icon || null, sprite: sprites[r.item_id] || null, price: Number(r.price), status: r.status, listedAt: r.listed_at, expiresAt: r.expires_at } : null; }).filter(Boolean);
}

// Full state for the Auction House screen (owner-gated during the build).
export async function getAuctionState(buyerId) {
    if (!isOwner(buyerId)) return { owner: false };
    const [listings, sellable, mine, goldRow, artRow] = await Promise.all([
        getAuctionListings(buyerId, {}).catch(() => []),
        getSellableItems(buyerId).catch(() => []),
        getMyListings(buyerId).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = 'auctioneer'`).catch(() => null),
    ]);
    return { owner: true, listings, sellable, mine, gold: Number(goldRow?.gold || 0), feePct: LIST_FEE_PCT, durations: DURATIONS, auctioneer: artRow?.url || null };
}

// List an owned, unequipped item at `price` gold for `days` days. Charges the 5% fee up front; removes the item.
export async function listAuctionItem(buyerId, itemId, price, days) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const it = itemById(itemId);
    if (!it) return { ok: false, error: "unknown_item" };
    const p = Math.floor(Number(price) || 0);
    if (p < MIN_PRICE || p > MAX_PRICE) return { ok: false, error: "bad_price" };
    const d = DURATIONS.includes(Number(days)) ? Number(days) : 3;
    const owns = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owns) return { ok: false, error: "not_owned" };
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    if (Object.values(equipped).includes(itemId)) return { ok: false, error: "equipped" };
    const fee = listingFee(p);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, fee]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    // Remove the item from inventory (guarded so a race can't double-list) and create the listing.
    const removed = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING id`, [buyerId, itemId]).catch(() => null);
    if (!removed) { // lost the race — refund the fee
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, fee]).catch(() => {});
        return { ok: false, error: "not_owned" };
    }
    await logCoin(buyerId, -fee, "auction_fee", { balanceAfter: paid.gold, meta: { itemId, price: p } }).catch(() => {});
    const row = await db.queryOne(
        `INSERT INTO mkt_auction (seller_id, item_id, price, fee, expires_at) VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval) RETURNING id`,
        [buyerId, itemId, p, fee, String(d)]
    ).catch(() => null);
    return { ok: true, id: Number(row?.id || 0), fee, gold: Number(paid.gold) };
}

// Buy an active listing. Buyer pays the price → seller receives it; the item is granted to the buyer.
export async function buyAuctionListing(buyerId, listingId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const lst = await db.queryOne(`SELECT id, seller_id, item_id, price FROM mkt_auction WHERE id = $1 AND status = 'active' AND expires_at > NOW()`, [listingId]).catch(() => null);
    if (!lst) return { ok: false, error: "gone" };
    if (lst.seller_id === buyerId) return { ok: false, error: "own_listing" };
    const already = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, lst.item_id]).catch(() => null);
    if (already) return { ok: false, error: "already_owned" };
    // Claim the listing atomically so it sells at most once.
    const claim = await db.queryOne(`UPDATE mkt_auction SET status = 'sold', buyer_id = $2, sold_at = NOW() WHERE id = $1 AND status = 'active' RETURNING price, seller_id, item_id`, [listingId, buyerId]).catch(() => null);
    if (!claim) return { ok: false, error: "gone" };
    const price = Number(claim.price);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!paid) { // can't afford after all — roll the listing back to active
        await db.query(`UPDATE mkt_auction SET status = 'active', buyer_id = NULL, sold_at = NULL WHERE id = $1`, [listingId]).catch(() => {});
        return { ok: false, error: "insufficient_gold" };
    }
    await logCoin(buyerId, -price, "auction_buy", { balanceAfter: paid.gold, meta: { itemId: claim.item_id } }).catch(() => {});
    const sellerPaid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [claim.seller_id, price]).catch(() => null);
    await logCoin(claim.seller_id, price, "auction_sale", { balanceAfter: sellerPaid?.gold, meta: { itemId: claim.item_id } }).catch(() => {});
    await grantItem(buyerId, claim.item_id, "auction").catch(() => {});
    await transferItemEnhancement(claim.seller_id, buyerId, claim.item_id); // any Forge enhancement rides with it
    const it = itemById(claim.item_id);
    return { ok: true, item: { id: claim.item_id, name: it?.name, rarity: it?.rarity }, price, gold: Number(paid.gold) };
}

// Cancel your own active listing → the item comes back to you (no fee refund).
export async function cancelAuctionListing(buyerId, listingId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const row = await db.queryOne(`UPDATE mkt_auction SET status = 'cancelled' WHERE id = $1 AND seller_id = $2 AND status = 'active' RETURNING item_id`, [listingId, buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "gone" };
    await grantItem(buyerId, row.item_id, "auction_return").catch(() => {});
    return { ok: true };
}
