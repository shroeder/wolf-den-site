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

/**
 * Every piece id this member owns — and, by default, the one they have on loan.
 *
 * THE LOANED EXHIBIT (an ascension power) names a single piece the member does NOT own and makes it count. It
 * is folded in HERE rather than at each aggregate because this function is the choke point every set bonus in
 * the game reads through: the farm, the mine, the sea, the forge, the wheel and the sets page all come down
 * this path, and a loan added anywhere else would apply to some of them and silently not to others — which is
 * this codebase's single most common bug.
 *
 * `includeLoan: false` is for the two places that must see the TRUTH: the drop pools. A loan that read as
 * ownership there would remove the piece from the pool it comes out of, so the one piece you most want would
 * become the one piece you can never win — the loan would quietly cost you the real thing.
 *
 * The loan is not ownership in any other sense either: it is never granted, never tradeable, and it stops the
 * moment the piece that grants it comes off.
 */
export async function getOwnedPieceIds(buyerId, { includeLoan = true } = {}) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT piece_id FROM mkt_user_collection WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const owned = (rows || []).map((r) => r.piece_id).filter(isPieceId);
    if (!includeLoan) return owned;
    const loan = await loanedPiece(buyerId);
    return loan && !owned.includes(loan) ? [...owned, loan] : owned;
}

/** The piece on loan right now, or null. Null the instant the piece granting the power is unequipped. */
export async function loanedPiece(buyerId) {
    if (!buyerId) return null;
    const { hasPower } = await import("@/lib/marketplace/ascension-powers.js");
    if (!(await hasPower(buyerId, "loaned_exhibit"))) return null;
    const r = await db.queryOne(`SELECT exhibit_piece FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return isPieceId(r?.exhibit_piece) ? r.exhibit_piece : null;
}

/**
 * Name the piece you are borrowing. Refuses one you already own — a loan of something in the cabinet is a
 * wasted slot, and the screen should say so rather than accept it silently.
 */
export async function setLoanedPiece(buyerId, pieceId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { hasPower } = await import("@/lib/marketplace/ascension-powers.js");
    if (!(await hasPower(buyerId, "loaned_exhibit"))) return { ok: false, error: "no_power" };
    const id = String(pieceId || "");
    if (!id) {
        await db.query(`UPDATE mkt_buyer SET exhibit_piece = NULL WHERE id = $1`, [buyerId]).catch(() => {});
        return { ok: true, exhibit: null };
    }
    if (!isPieceId(id)) return { ok: false, error: "not_found" };
    const owned = await getOwnedPieceIds(buyerId, { includeLoan: false });
    if (owned.includes(id)) return { ok: false, error: "already_owned" };
    await db.query(`UPDATE mkt_buyer SET exhibit_piece = $2 WHERE id = $1`, [buyerId, id]).catch(() => {});
    return { ok: true, exhibit: id };
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
    // TRUTH, not the loan — see getOwnedPieceIds. A borrowed piece must still be winnable.
    const owned = new Set(await getOwnedPieceIds(buyerId, { includeLoan: false }));
    const pool = COLLECTION_PIECES.filter((p) => p.source === source && !owned.has(p.id) && (!rarity || p.rarity === rarity));
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const got = await grantPiece(buyerId, pick.id, source);
    return got ? pick : null;
}

/**
 * A piece off ANY set the member is short of — The Founder's Plate.
 *
 * rollPieceDrop above is deliberately keyed to a `source`, because every ordinary acquisition path is: a chest
 * gives chest trophies, the mine gives mine trophies. This one is not a path, it is a delivery, so it draws
 * from everything unowned regardless of where it would normally come from — which is exactly what makes it
 * worth the item slot. Returns the piece def, or null when the collection is complete.
 */
export async function grantMissingPiece(buyerId, source = "grant") {
    if (!buyerId) return null;
    const { COLLECTION_PIECES } = await import("@/lib/marketplace/collection-pieces.js");
    const owned = new Set(await getOwnedPieceIds(buyerId, { includeLoan: false }));
    const pool = COLLECTION_PIECES.filter((p) => !owned.has(p.id));
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
