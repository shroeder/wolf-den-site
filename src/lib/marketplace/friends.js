import "server-only";

import { db } from "@/lib/db";
import { notifyFriendAccepted, notifyFriendRequest } from "@/lib/marketplace/social-notify.js";
import { awardOnce, levelForXp } from "@/lib/marketplace/xp.js";
import { pickShowcaseBadges } from "@/lib/marketplace/badge-display.js";
import { avatarImageUrl, sanitizeCosmetics } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";

// Both people in a new friendship get a one-time "first friend" onboarding reward (deduped, so it
// only ever fires for each once). Best-effort.
async function awardFirstFriend(a, b) {
    await Promise.all([awardOnce(a, "first_friend", { friendId: b }), awardOnce(b, "first_friend", { friendId: a })]).catch(() => {});
}

// Friendships: mutual add (request -> accept/decline). All lookups are pair-based so direction doesn't
// matter once accepted. Presentational mapping mirrors the public profile (no contact info).

function mapUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        alias: row.alias || null,
        // Public label — never the real first/last name (private). Handle / chosen display name only.
        displayLabel: row.display_name || row.alias || "Member",
        avatarUrl: avatarImageUrl(row.avatar_config, row.avatar_cosmetics) || row.avatar_url || DEFAULT_AVATAR_URL,
        avatarCosmetics: sanitizeCosmetics(row.avatar_cosmetics),
        level: levelForXp(row.xp || 0).level,
        border: row.equipped_border || "none",
        frame: row.equipped_frame || "none",
        showcaseSlugs: row.showcase_badge_slugs || null,
        lockedBadge: row.locked_badge || null,
        featuredCollectibleId: row.featured_collectible || null,
    };
}

const USER_COLS = "id, alias, display_name, avatar_url, avatar_config, avatar_cosmetics, xp, equipped_border, equipped_frame, showcase_badge_slugs, locked_badge, featured_collectible";

// Batch-attach each user's badges (for hero cards). One query for the whole set, not per-user.
async function attachBadges(users) {
    const list = users.filter(Boolean);
    const ids = list.map((u) => u.id);
    if (!ids.length) return users;
    const rows = await db
        .query(
            `SELECT ub.buyer_id, b.slug, b.icon, b.label, b.color, b.admin_only
               FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
              WHERE ub.buyer_id = ANY($1)
              ORDER BY b.sort_order ASC`,
            [ids]
        )
        .catch(() => []);
    const byId = new Map();
    for (const r of rows) {
        if (!byId.has(r.buyer_id)) byId.set(r.buyer_id, []);
        byId.get(r.buyer_id).push({ slug: r.slug, icon: r.icon || null, label: r.label, color: r.color || null, adminOnly: r.admin_only !== false });
    }
    return users.map((u) => {
        if (!u) return u;
        const badges = byId.get(u.id) || [];
        // Cap what shows on the card to the member's showcase (or their top few), tab = the top of those.
        const displayBadges = pickShowcaseBadges(badges, u.showcaseSlugs, u.lockedBadge || null);
        return { ...u, badges, displayBadges, featuredBadge: displayBadges[0] || null };
    });
}

// Search members to add (by @handle or name). Excludes self. Annotates the relationship so the UI can
// show "Add" / "Requested" / "Friends" / "Respond".
export async function searchUsers(query, viewerId, limit = 15) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_]/g, "\\$&").toLowerCase()}%`;
    // Search by @handle or chosen display name only — NOT real first/last name, so members can't be
    // enumerated/confirmed by legal name.
    const rows = await db
        .query(
            `SELECT ${USER_COLS} FROM mkt_buyer
              WHERE id <> $2 AND alias IS NOT NULL
                AND (LOWER(alias) LIKE $1 OR LOWER(COALESCE(display_name,'')) LIKE $1)
              ORDER BY xp DESC LIMIT $3`,
            [like, viewerId, limit]
        )
        .catch(() => []);
    const withStatus = await Promise.all(
        rows.map(async (r) => ({ ...mapUser(r), relation: await friendStatus(viewerId, r.id) }))
    );
    return attachBadges(withStatus);
}

// Browseable member directory: every member with a public @handle, newest-strongest first, annotated
// with the viewer's relation. Optional `q` filters by handle / chosen display name (never real name).
// Relations are batched into one query (not one per member).
export async function listMembers(viewerId, { q = "", limit = 60, offset = 0 } = {}) {
    const query = String(q || "").trim();
    const params = [viewerId];
    let where = `id <> $1 AND alias IS NOT NULL`;
    if (query.length >= 1) {
        params.push(`%${query.replace(/[%_]/g, "\\$&").toLowerCase()}%`);
        where += ` AND (LOWER(alias) LIKE $${params.length} OR LOWER(COALESCE(display_name,'')) LIKE $${params.length})`;
    }
    params.push(Math.max(1, Math.min(100, limit)));
    const limIdx = params.length;
    params.push(Math.max(0, offset));
    const offIdx = params.length;

    const [rows, rels] = await Promise.all([
        db.query(
            `SELECT ${USER_COLS} FROM mkt_buyer WHERE ${where} ORDER BY COALESCE(xp,0) DESC, updated_at DESC LIMIT $${limIdx} OFFSET $${offIdx}`,
            params
        ).catch(() => []),
        db.query(
            `SELECT requester_id, addressee_id, status FROM mkt_friendship WHERE requester_id = $1 OR addressee_id = $1`,
            [viewerId]
        ).catch(() => []),
    ]);

    const relMap = new Map();
    for (const f of rels) {
        const other = f.requester_id === viewerId ? f.addressee_id : f.requester_id;
        relMap.set(other, f.status === "accepted" ? "friends" : f.requester_id === viewerId ? "outgoing" : "incoming");
    }
    return attachBadges(rows.map((r) => ({ ...mapUser(r), relation: relMap.get(r.id) || "none" })));
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
            await awardFirstFriend(requesterId, addresseeId);
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
        if (rows.length > 0) {
            await notifyFriendAccepted(rows[0].requester_id, userId);
            await awardFirstFriend(userId, rows[0].requester_id);
        }
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
    return attachBadges(rows.map(mapUser));
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
        incoming: await attachBadges(incoming.map((r) => ({ requestId: r.request_id, ...mapUser(r) }))),
        outgoing: await attachBadges(outgoing.map((r) => ({ requestId: r.request_id, ...mapUser(r) }))),
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

// Count of incoming friend requests awaiting the user's response (drives the notifications bubble).
export async function incomingRequestCount(userId) {
    if (!userId) return 0;
    const row = await db
        .queryOne(`SELECT COUNT(*)::int AS n FROM mkt_friendship WHERE addressee_id = $1 AND status = 'pending'`, [userId])
        .catch(() => null);
    return row?.n || 0;
}
