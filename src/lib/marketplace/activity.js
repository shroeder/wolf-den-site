import "server-only";

import { db } from "@/lib/db";

// Granular customer-action telemetry. trackActivity is best-effort + non-blocking (never breaks the action
// it's logging). Events are short keys with optional meta; the admin app maps them to friendly labels.

// Client-firable events (via /api/marketplace/track) — everything else is logged server-side at the action.
export const CLIENT_EVENTS = new Set(["view_profile", "shop_search", "inspect_item", "view_boss", "view_leaderboard", "browse_shop", "view_vendor"]);

export async function trackActivity(buyerId, event, meta = null) {
    if (!buyerId || !event) return;
    await db
        .query(`INSERT INTO mkt_activity_event (buyer_id, event, meta) VALUES ($1, $2, $3)`, [buyerId, String(event).slice(0, 40), meta ? JSON.stringify(meta) : null])
        .catch(() => {});
}

// A member's recent granular actions (for the drill-down), newest first.
export async function memberActivityFeed(buyerId, limit = 80) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT event, meta, created_at FROM mkt_activity_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`, [buyerId, Math.min(200, limit)]).catch(() => []);
    return rows.map((r) => ({ event: r.event, meta: r.meta || null, at: r.created_at }));
}

// Activity counts per member over a window (default 30 days) — drives most/least-active ranking.
export async function activityCounts(buyerIds, days = 30) {
    if (!buyerIds?.length) return new Map();
    const rows = await db
        .query(
            `SELECT buyer_id, COUNT(*)::int AS n, MAX(created_at) AS last_at
               FROM mkt_activity_event
              WHERE buyer_id = ANY($1) AND created_at > NOW() - ($2 || ' days')::interval
              GROUP BY buyer_id`,
            [buyerIds, String(days)]
        )
        .catch(() => []);
    return new Map(rows.map((r) => [r.buyer_id, { count: r.n, lastAt: r.last_at }]));
}
