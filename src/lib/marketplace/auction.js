import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { itemById, describeStats, describeFarm, describeSea, describeDepth, STAT_META, EQUIP_SLOTS, isTradeLocked } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { DECO_STATS } from "@/lib/marketplace/decorations.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { grantItem, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { transferItemEnhancement, enhanceDetailsFor } from "@/lib/marketplace/crafting.js";
import { describeUtil } from "@/lib/marketplace/item-affix.js";
import { transferItemElement } from "@/lib/marketplace/item-element.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";

// Merge base item stats with a forge stat-bonus into effective totals.
function mergeStats(base = {}, bonus = {}) {
    const m = { ...(base || {}) };
    for (const [k, v] of Object.entries(bonus || {})) m[k] = (m[k] || 0) + (Number(v) || 0);
    return m;
}
const parseBonus = (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : (v || {}));
const statTotal = (stats = {}) => Object.values(stats).reduce((a, b) => a + (Number(b) || 0), 0);

// The viewer's currently-equipped gear, per equip slot, with EFFECTIVE (base + forge) combat stats and farm
// affixes — the baseline a listing is compared against. { [equipSlot]: { id, name, level, itemSlot, stats, farm } }.
async function equippedComparisonMap(buyerId) {
    if (!buyerId) return {};
    const bySlot = await getEquippedIds(buyerId).catch(() => ({}));
    const ids = Object.values(bySlot);
    if (!ids.length) return {};
    const enhRows = await db.query(`SELECT item_id, level, stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2) AND level > 0`, [buyerId, ids]).catch(() => []);
    const enh = new Map(enhRows.map((e) => [e.item_id, { level: Number(e.level) || 0, bonus: parseBonus(e.stat_bonus) }]));
    const map = {};
    for (const [slot, id] of Object.entries(bySlot)) {
        const it = itemById(id);
        if (!it) continue;
        const e = enh.get(id);
        map[slot] = { id, name: it.name, level: e?.level || 0, itemSlot: it.slot, stats: mergeStats(it.stats || {}, e?.bonus || {}), farm: it.farm || {} };
    }
    return map;
}

// Compare one listing (its item def + effective combat stats) against what the viewer has equipped in that slot.
// Returns { none, equippedName, equippedEnhance, diffs:[{key,label,icon,delta,suffix}], farmDiffs:[...] } or null
// for non-equippable items. For a two-ring slot we compare against the WEAKER equipped ring (the one you'd swap),
// and treat an open slot as a pure upgrade (none:true).
function buildCompare(listItem, listEffective, equippedMap) {
    const slotDefs = EQUIP_SLOTS.filter((s) => s.accepts === listItem.slot);
    if (!slotDefs.length) return null; // misc / non-equippable
    const equippedHere = slotDefs.map((s) => equippedMap[s.slot]).filter(Boolean);
    const openSlot = equippedHere.length < slotDefs.length;
    const target = openSlot ? null : equippedHere.sort((a, b) => statTotal(a.stats) - statTotal(b.stats))[0];
    const eqStats = target?.stats || {};
    const listFarm = listItem.farm || {};
    const eqFarm = target?.farm || {};
    const diffs = [];
    for (const k of new Set([...Object.keys(listEffective), ...Object.keys(eqStats)])) {
        if (!STAT_META[k]) continue;
        const delta = (Number(listEffective[k]) || 0) - (Number(eqStats[k]) || 0);
        if (delta !== 0) diffs.push({ key: k, label: STAT_META[k].label, icon: STAT_META[k].icon, delta, suffix: STAT_META[k].suffix || "" });
    }
    const farmDiffs = [];
    for (const k of new Set([...Object.keys(listFarm), ...Object.keys(eqFarm)])) {
        const delta = (Number(listFarm[k]) || 0) - (Number(eqFarm[k]) || 0);
        if (delta !== 0) { const m = DECO_STATS[k]; farmDiffs.push({ key: k, label: m?.label || k, icon: m?.icon || "🌱", delta }); }
    }
    diffs.sort((a, b) => b.delta - a.delta);
    farmDiffs.sort((a, b) => b.delta - a.delta);
    return { none: !target, equippedName: target?.name || null, equippedEnhance: target?.level || 0, diffs, farmDiffs };
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
        farm: it.farm ? describeFarm(it.farm) : null, // 🌱 harvest/farm affinity (kept out of combat stats)
        sea: it.sea ? describeSea(it.sea) : null, depth: it.depth ? describeDepth(it.depth) : null, // ⚓ sailing affinity
        util: det?.util || null, // rare Forge attunement (spin-off bonus stat) that rides with the item
        signature: signatureFor(row.item_id), // ★ signature ability (the item's special power)
        sprite: sprites[row.item_id] || null,
        enhanceLevel: det?.level || 0,
        price: Number(row.price),
        sellerId: row.seller_id,
        sellerName: row.display_name || (row.alias ? `@${row.alias}` : "A wolf"),
        sellerAlias: row.alias || null,
        listedAt: row.listed_at,
        expiresAt: row.expires_at,
        // Browse only ever queries ACTIVE rows, so this was left off — but the detail modal is SHARED with the
        // Listings tab and gates the whole owner footer on `status === "active"`. Opening your own listing from
        // Browse therefore showed neither the price nor a Cancel button, because the buy footer is skipped for
        // your own item and the owner footer never rendered.
        status: "active",
        mine: viewerId && row.seller_id === viewerId,
        owned: ownedSet.has(row.item_id), // viewer already owns this item (can't buy a duplicate)
    };
}

// Lazily expire any past-due active listings, returning each item to its seller. Idempotent (status guard).
export async function expireAuctions() {
    const due = await db.query(`UPDATE mkt_auction SET status = 'expired' WHERE status = 'active' AND expires_at < NOW() RETURNING seller_id, item_id`, []).catch(() => []);
    for (const r of due) await grantItem(r.seller_id, r.item_id, "auction_return").catch(() => {});
    // Tell the seller their listing died. It used to just quietly reappear in their inventory, so unless they
    // went looking they never learned it hadn't sold — and couldn't decide to relist it cheaper.
    for (const r of due) {
        const it = itemById(r.item_id);
        await sendWebPush(r.seller_id, {
            kind: "auction",
            title: "⌛ Listing expired",
            body: `${it?.name || "Your listing"} didn't sell and is back in your inventory. Relist it any time.`,
            url: "/marketplace/auction",
            tag: "auction-expired",
            data: { type: "auction_expired", itemId: r.item_id },
        }).catch(() => {});
    }
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
    const sellableIds = owned.map((r) => r.item_id).filter((id) => !equippedSet.has(id) && !listedSet.has(id) && itemById(id) && !isTradeLocked(itemById(id).rarity));
    const enh = await enhanceDetailsFor(buyerId, sellableIds).catch(() => ({}));
    return sellableIds
        .map((id) => {
            const it = itemById(id);
            const bonus = enh[id]?.bonus || null;
            return { itemId: id, name: it.name, rarity: it.rarity, slot: it.slot || "misc", icon: it.icon || null, sprite: sprites[id] || null, stats: describeStats(mergeStats(it.stats || {}, bonus || {})) || null, forgeStats: bonus && Object.keys(bonus).length ? describeStats(bonus) : null, farm: it.farm ? describeFarm(it.farm) : null, sea: it.sea ? describeSea(it.sea) : null, depth: it.depth ? describeDepth(it.depth) : null, util: enh[id]?.util || null, signature: signatureFor(id), enhanceLevel: enh[id]?.level || 0 };
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
    const enhRows = sellerIds.length ? await db.query(`SELECT buyer_id, item_id, level, stat_bonus, util FROM mkt_item_enhance WHERE buyer_id = ANY($1) AND item_id = ANY($2) AND level > 0`, [sellerIds, itemIds]).catch(() => []) : [];
    const enhMap = new Map(enhRows.map((e) => [`${e.buyer_id}|${e.item_id}`, { level: Number(e.level) || 0, bonus: (typeof e.stat_bonus === "string" ? (() => { try { return JSON.parse(e.stat_bonus); } catch { return {}; } })() : (e.stat_bonus || {})), util: describeUtil(e.util) }]));
    let out = rows.map((r) => shapeListing(r, sprites, buyerId, ownedSet, enhMap)).filter(Boolean);
    const needle = String(q || "").trim().toLowerCase();
    if (needle) out = out.filter((l) => l.name.toLowerCase().includes(needle) || l.sellerName.toLowerCase().includes(needle));
    if (slot) out = out.filter((l) => l.slot === slot);
    if (rarity) out = out.filter((l) => l.rarity === rarity);
    if (sort === "old") out.sort((a, b) => new Date(a.listedAt) - new Date(b.listedAt));
    else if (sort === "price_asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") out.sort((a, b) => b.price - a.price);
    // 'new' is already newest-first from the query order
    // Attach a side-by-side comparison to what the viewer has equipped in that slot (upgrade/downgrade at a glance).
    const equippedMap = await equippedComparisonMap(buyerId);
    out = out.map((l) => {
        const it = itemById(l.itemId);
        const det = enhMap.get(`${l.sellerId}|${l.itemId}`);
        return { ...l, compare: it ? buildCompare(it, mergeStats(it.stats || {}, det?.bonus || {}), equippedMap) : null };
    });
    return out;
}

// A seller's own listings (active first, then recently ended). Carries the SAME rich detail as browse cards
// (effective stats, forge bonus, attunement, signature, farm/sea affinity + a comparison vs your equipped) so
// the detail modal works for your own listings too.
export async function getMyListings(buyerId) {
    if (!buyerId) return [];
    await expireAuctions();
    const rows = await db.query(
        `SELECT a.id, a.seller_id, a.item_id, a.price, a.status, a.listed_at, a.expires_at, a.sold_at,
                buyer.display_name AS buyer_name, buyer.alias AS buyer_alias
           FROM mkt_auction a
           LEFT JOIN mkt_buyer buyer ON buyer.id = a.buyer_id
          WHERE a.seller_id = $1 AND (a.status = 'active' OR a.status IN ('sold','expired','cancelled') AND a.listed_at > NOW() - INTERVAL '7 days')
          ORDER BY (a.status = 'active') DESC, a.listed_at DESC LIMIT 100`, [buyerId]
    ).catch(() => []);
    const sprites = await itemSpriteMap().catch(() => ({}));
    // Forge enhancement per listed item (for effective stats + the "⚒️ +N" badge) and the viewer's equipped baseline.
    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    const enhRows = itemIds.length ? await db.query(`SELECT item_id, level, stat_bonus, util FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2) AND level > 0`, [buyerId, itemIds]).catch(() => []) : [];
    const enh = new Map(enhRows.map((e) => [e.item_id, { level: Number(e.level) || 0, bonus: parseBonus(e.stat_bonus), util: describeUtil(e.util) }]));
    const equippedMap = await equippedComparisonMap(buyerId);
    return rows.map((r) => {
        const it = itemById(r.item_id);
        if (!it) return null;
        const det = enh.get(r.item_id);
        const bonus = det?.bonus || null;
        const buyerName = r.status === "sold" ? (r.buyer_name || (r.buyer_alias ? `@${r.buyer_alias}` : "a wolf")) : null;
        return {
            id: Number(r.id), itemId: r.item_id, name: it.name, rarity: it.rarity, slot: it.slot || "misc", icon: it.icon || null, sprite: sprites[r.item_id] || null,
            price: Number(r.price), status: r.status, listedAt: r.listed_at, expiresAt: r.expires_at, soldAt: r.sold_at, buyerName, buyerAlias: r.status === "sold" ? r.buyer_alias : null,
            stats: describeStats(mergeStats(it.stats || {}, bonus || {})) || null,
            forgeStats: bonus && Object.keys(bonus).length ? describeStats(bonus) : null,
            farm: it.farm ? describeFarm(it.farm) : null,
            sea: it.sea ? describeSea(it.sea) : null, depth: it.depth ? describeDepth(it.depth) : null,
            util: det?.util || null,
            signature: signatureFor(r.item_id),
            enhanceLevel: det?.level || 0,
            compare: buildCompare(it, mergeStats(it.stats || {}, bonus || {}), equippedMap),
            mine: true,
        };
    }).filter(Boolean);
}

// Full state for the Auction House screen (owner-gated during the build).
export async function getAuctionState(buyerId) {
    if (!buyerId) return { owner: false };
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
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const it = itemById(itemId);
    if (!it) return { ok: false, error: "unknown_item" };
    if (isTradeLocked(it.rarity)) return { ok: false, error: "item_bound" }; // Ascendant+ is bound — can't be auctioned
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
    if (!buyerId) return { ok: false, error: "not_signed_in" };
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
    await transferItemElement(claim.seller_id, buyerId, claim.item_id); // ...and any elemental reforge
    const it = itemById(claim.item_id);
    // A LEVEL item the seller sold must not be auto-re-granted back to them (syncLevelItems) — mark it sold for
    // the seller, mirroring salvage. (Harmless for other sources; they're never auto-granted anyway.)
    if (it?.source === "level") await db.query(`INSERT INTO mkt_sold_item (buyer_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [claim.seller_id, claim.item_id]).catch(() => {});
    // Sale done → check both sides for newly-earned Auction badges.
    syncEarnedBadges(buyerId).catch(() => {});
    syncEarnedBadges(claim.seller_id).catch(() => {});
    // Notify the SELLER their item sold (web push).
    (async () => {
        const b = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        const who = b?.display_name || (b?.alias ? `@${b.alias}` : "a wolf");
        await sendWebPush(claim.seller_id, {
            kind: "auction",
            title: "💰 Your item sold!",
            body: `${it?.name || "Your listing"} sold to ${who} for ${price.toLocaleString()} gold.`,
            url: "/marketplace/auction",
            tag: `auction-sold-${claim.id}`,
            data: { type: "auction_sold" },
        }).catch(() => {});
    })().catch(() => {});
    return { ok: true, item: { id: claim.item_id, name: it?.name, rarity: it?.rarity }, price, gold: Number(paid.gold) };
}

// Cancel your own active listing → the item comes back to you (no fee refund).
export async function cancelAuctionListing(buyerId, listingId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`UPDATE mkt_auction SET status = 'cancelled' WHERE id = $1 AND seller_id = $2 AND status = 'active' RETURNING item_id`, [listingId, buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "gone" };
    await grantItem(buyerId, row.item_id, "auction_return").catch(() => {});
    return { ok: true };
}
