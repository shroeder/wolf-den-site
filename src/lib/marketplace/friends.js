import "server-only";

import { db } from "@/lib/db";
import { notifyFriendAccepted, notifyFriendRequest } from "@/lib/marketplace/social-notify.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// Friendships: mutual add (request -> accept/decline). All lookups are pair-based so direction doesn't
// matter once accepted. Presentational mapping mirrors the public profile (no contact info).

function mapUser(row) {
    if (!row) return null;
    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    return {
        id: row.id,
        alias: row.alias || null,
        displayLabel: name || row.alias || row.display_name || "Member",
        avatarUrl: row.avatar_url || null,
        level: levelForXp(row.xp || 0).level,
    };
}

const USER_COLS = "id, alias, first_name, last_name, display_name, avatar_url, xp";

// Search members to add (by @handle or name). Excludes self. Annotates the relationship so the UI can
// show "Add" / "Requested" / "Friends" / "Respond".
export async function searchUsers(query, viewerId, limit = 15) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_]/g, "\\$&").toLowerCase()}%`;
    const rows = await db
        .query(
            `SELECT ${USER_COLS} FROM mkt_buyer
              WHERE id <> $2 AND alias IS NOT NULL
                AND (LOWER(alias) LIKE $1 OR LOWER(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE $1)
              ORDER BY xp DESC LIMIT $3`,
            [like, viewerId, limit]
        )
        .catch(() => []);
    const withStatus = await Promise.all(
        rows.map(async (r) => ({ ...mapUser(r), relation: await friendStatus(viewerId, r.id) }))
    );
    return withStatus;
}

// Relationship of `otherId` to `viewerId`: none | friends | outgoing (viewer requested) | incoming.
export async function friendStatus(viewerId, otherId) {
    if (!viewerId || !otherId || viewerId === otherId) return "self";
    const row = await db
        .queryOne(
            `SELECT requester_id, status FROM mkt_friendship
              WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
            [viewerId, otherId]
        )
        .catch(() => null);
    if (!row) return "none";
    if (row.status === "accepted") return "friends";
    return row.requester_id === viewerId ? "outgoing" : "incoming";
}

export async function areFriends(a, b) {
    return (await friendStatus(a, b)) === "friends";
}

// Send a friend request. If the other person already requested you, this accepts it instead.
export async function sendFriendRequest(requesterId, addresseeId) {
    if (!requesterId || !addresseeId || requesterId === addresseeId) return { ok: false, error: "invalid" };
    const existing = await db
        .queryOne(
            `SELECT id, requester_id, status FROM mkt_friendship
              WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
            [requesterId, addresseeId]
        )
        .catch(() => null);
    if (existing) {
        if (existing.status === "accepted") return { ok: true, status: "friends" };
        // They already requested me -> accept.
        if (existing.requester_id === addresseeId) {
            await db.query(`UPDATE mkt_friendship SET status = 'accepted', responded_at = NOW() WHERE id = $1`, [existing.id]).catch(() => {});
            // The original requester (addresseeId) gets an "accepted" nudge.
            await notifyFriendAccepted(addresseeId, requesterId);
            return { ok: true, status: "friends" };
        }
        return { ok: true, status: "outgoing" }; // already pending from me
    }
    await db
        .query(`INSERT INTO mkt_friendship (requester_id, addressee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [requesterId, addresseeId])
        .catch(() => {});
    await notifyFriendRequest(addresseeId, requesterId);
    return { ok: true, status: "outgoing" };
}

// Accept or decline a request addressed to `userId`.
export async function respondToRequest(userId, requestId, accept) {
    if (!userId || !requestId) return { ok: false, error: "invalid" };
    if (accept) {
        const rows = await db
            .query(`UPDATE mkt_friendship SET status = 'accepted', responded_at = NOW()
                     WHERE id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING requester_id`, [requestId, userId])
            .catch(() => []);
        if (rows.length > 0) await notifyFriendAccepted(rows[0].requester_id, userId);
        return { ok: rows.length > 0 };
    }
    await db.query(`DELETE FROM mkt_friendship WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`, [requestId, userId]).catch(() => {});
    return { ok: true };
}

// Remove a friend (or cancel an outgoing request) — deletes the pair row in either direction.
export async function removeFriend(userId, otherId) {
    if (!userId || !otherId) return { ok: false };
    await db
        .query(
            `DELETE FROM mkt_friendship
              WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
            [userId, otherId]
        )
        .catch(() => {});
    return { ok: true };
}

export async function listFriends(userId) {
    if (!userId) return [];
    const rows = await db
        .query(
            `SELECT ${USER_COLS.split(", ").map((c) => `b.${c}`).join(", ")}
               FROM mkt_friendship f
               JOIN mkt_buyer b ON b.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
              WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
              ORDER BY b.alias ASC`,
            [userId]
        )
        .catch(() => []);
    return rows.map(mapUser);
}

// Pending requests: incoming (awaiting my response) + outgoing (I sent). Incoming carry the request id.
export async function listPending(userId) {
    if (!userId) return { incoming: [], outgoing: [] };
    const [incoming, outgoing] = await Promise.all([
        db.query(
            `SELECT f.id AS request_id, ${USER_COLS.split(", ").map((c) => `b.${c}`).join(", ")}
               FROM mkt_friendship f JOIN mkt_buyer b ON b.id = f.requester_id
              WHERE f.addressee_id = $1 AND f.status = 'pending' ORDER BY f.created_at DESC`,
            [userId]
        ).catch(() => []),
        db.query(
            `SELECT f.id AS request_id, ${USER_COLS.split(", ").map((c) => `b.${c}`).join(", ")}
               FROM mkt_friendship f JOIN mkt_buyer b ON b.id = f.addressee_id
              WHERE f.requester_id = $1 AND f.status = 'pending' ORDER BY f.created_at DESC`,
            [userId]
        ).catch(() => []),
    ]);
    return {
        incoming: incoming.map((r) => ({ requestId: r.request_id, ...mapUser(r) })),
        outgoing: outgoing.map((r) => ({ requestId: r.request_id, ...mapUser(r) })),
    };
}

export async function friendCount(userId) {
    if (!userId) return 0;
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_friendship WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
            [userId]
        )
        .catch(() => null);
    return row?.n || 0;
}
