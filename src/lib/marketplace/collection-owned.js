import "server-only";

import { db } from "@/lib/db";
import { isPieceId, pieceById } from "@/lib/marketplace/collection-pieces.js";

// ── WHO OWNS WHICH TROPHIES ──────────────────────────────────────────────────────────────────────────────────
// The single door to mkt_user_collection. Pieces used to live in mkt_user_item, which meant every one of the
// forty-odd reads of that table had to decide whether it wanted gear, trophies or both — and the ones that
// wanted gear had to remember to say so. Now the two are different tables and the question answers itself.
//
// Ownership is BINARY and PERMANENT: you have the piece or you do not. There is no quantity, no equipping and
// no losing it, so this file has exactly two verbs.

/** Every piece id this member owns. */
export async function getOwnedPieceIds(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT piece_id FROM mkt_user_collection WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return (rows || []).map((r) => r.piece_id).filter(isPieceId);
}

/** Owned piece ids for MANY members at once, as { buyerId: [pieceId, ...] }. For rosters and leaderboards. */
export async function getOwnedPieceMap(buyerIds = []) {
    const ids = (buyerIds || []).filter(Boolean);
    if (!ids.length) return {};
    const rows = await db.query(`SELECT buyer_id, piece_id FROM mkt_user_collection WHERE buyer_id = ANY($1)`, [ids]).catch(() => []);
    const out = {};
    for (const r of rows || []) {
        if (!isPieceId(r.piece_id)) continue;
        (out[r.buyer_id] = out[r.buyer_id] || []).push(r.piece_id);
    }
    return out;
}

/**
 * Award a piece. Idempotent — a second grant of something already owned is a no-op rather than a duplicate,
 * because owning it twice means nothing. Returns true only when it was actually NEW, so callers can decide
 * whether to celebrate.
 */
export async function grantPiece(buyerId, pieceId, source = "grant") {
    if (!buyerId || !isPieceId(pieceId)) return false;
    const row = await db
        .queryOne(
            `INSERT INTO mkt_user_collection (buyer_id, piece_id, source) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, piece_id) DO NOTHING RETURNING piece_id`,
            [buyerId, pieceId, String(source || "grant").slice(0, 40)]
        )
        .catch(() => null);
    return Boolean(row);
}

/** The pieces a member does NOT yet own, for reward paths that should only ever hand out something new. */
export async function unownedPiecesOf(buyerId, candidates = []) {
    const owned = new Set(await getOwnedPieceIds(buyerId));
    return (candidates || []).filter((id) => isPieceId(id) && !owned.has(id));
}

/** Display shape for a piece the member owns (or doesn't) — used by the collections panel. */
export const dressPiece = (id, owned) => {
    const p = pieceById(id);
    if (!p) return null;
    return { id: p.id, name: p.name, rarity: p.rarity, icon: p.icon, flavor: p.flavor, set: p.set, owned: Boolean(owned) };
};

/**
 * Roll a trophy for a reward path — the ONE place any feature asks "does this drop a collection piece?".
 *
 * Before the migration each acquisition path just found its pieces inside ITEMS by `source`, because trophies
 * were items. They are not any more, so without this every one of them would silently stop dropping and the
 * sets would quietly become unobtainable. Five call sites, one helper, so a new feature that wants to hand out
 * a trophy has one obvious thing to call.
 *
 * `source` matches the piece's own `source` field (chest / wheel_bonus / mining / forge / xp_shop). Returns the
 * piece def that was granted, or null. Never grants something already owned.
 */
export async function rollPieceDrop(buyerId, { source, rarity = null, chance = 1 } = {}) {
    if (!buyerId || !source) return null;
    if (chance < 1 && Math.random() >= chance) return null;
    const { COLLECTION_PIECES } = await import("@/lib/marketplace/collection-pieces.js");
    const owned = new Set(await getOwnedPieceIds(buyerId));
    const pool = COLLECTION_PIECES.filter((p) => p.source === source && !owned.has(p.id) && (!rarity || p.rarity === rarity));
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const got = await grantPiece(buyerId, pick.id, source);
    return got ? pick : null;
}

/** Every piece a given source can still hand this member — for building a pick-a-box board or a shop list. */
export async function unownedFromSource(buyerId, source) {
    const { COLLECTION_PIECES } = await import("@/lib/marketplace/collection-pieces.js");
    const owned = new Set(await getOwnedPieceIds(buyerId));
    return COLLECTION_PIECES.filter((p) => p.source === source && !owned.has(p.id));
}

/**
 * Everything you own that a SET can count — gear in the bag plus trophies in this table.
 *
 * This exists because `getOwnedItemIds` did not survive the migration honestly. Every one of its nine callers
 * was asking "what do I own, for set purposes" — farm grow and double-harvest, four mining capstones, the raid
 * extras, the wheel's lucky-spin chance, the sea and farm affinity panels — and the moment trophies left
 * mkt_user_item every one of them silently started reading a set as unfinished. Nothing threw. Two members
 * noticed before I did.
 *
 * So the question is asked explicitly now. `getOwnedGearIds` is gear and says so; this is the union and says
 * so. There is no longer a function whose name lets you get it wrong by default.
 */
export async function getOwnedSetIds(buyerId) {
    if (!buyerId) return [];
    const { getOwnedGearIds } = await import("@/lib/marketplace/inventory.js");
    const [gear, pieces] = await Promise.all([
        getOwnedGearIds(buyerId).catch(() => []),
        getOwnedPieceIds(buyerId).catch(() => []),
    ]);
    return [...gear, ...pieces];
}
