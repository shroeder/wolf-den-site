import "server-only";

import { db } from "@/lib/db";

// Granular customer-action telemetry. trackActivity is best-effort + non-blocking (never breaks the action
// it's logging). Events are short keys with optional meta; the admin app maps them to friendly labels.

// Client-firable events (via /api/marketplace/track). page_view covers ALL traffic incl. anonymous.
export const CLIENT_EVENTS = new Set(["page_view", "view_profile", "shop_search", "inspect_item", "view_boss", "view_leaderboard", "browse_shop", "view_vendor"]);

// Log an event. buyerId OR anonId identifies who; path is set for page views. Best-effort, non-blocking.
export async function trackActivity(buyerId, event, meta = null, { path = null, anonId = null } = {}) {
    if (!event || (!buyerId && !anonId)) return;
    await db
        .query(
            `INSERT INTO mkt_activity_event (buyer_id, event, meta, path, anon_id) VALUES ($1, $2, $3, $4, $5)`,
            [buyerId || null, String(event).slice(0, 40), meta ? JSON.stringify(meta) : null, path ? String(path).slice(0, 200) : null, anonId ? String(anonId).slice(0, 48) : null]
        )
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

// Site-wide telemetry dashboard: recent live feed + engagement reports over a window (hours).
export async function telemetryDashboard({ hours = 24, feedLimit = 120 } = {}) {
    const win = `${Math.max(1, Math.min(720, Number(hours) || 24))} hours`;
    const [feed, topEvents, topPages, totals, hourly] = await Promise.all([
        db.query(
            `SELECT a.event, a.path, a.meta, a.created_at, a.anon_id, b.display_name, b.alias
               FROM mkt_activity_event a LEFT JOIN mkt_buyer b ON b.id = a.buyer_id
              ORDER BY a.created_at DESC LIMIT $1`,
            [Math.min(300, feedLimit)]
        ).catch(() => []),
        db.query(`SELECT event, COUNT(*)::int AS n FROM mkt_activity_event WHERE created_at > NOW() - $1::interval GROUP BY event ORDER BY n DESC LIMIT 25`, [win]).catch(() => []),
        db.query(`SELECT path, COUNT(*)::int AS n FROM mkt_activity_event WHERE event = 'page_view' AND path IS NOT NULL AND created_at > NOW() - $1::interval GROUP BY path ORDER BY n DESC LIMIT 25`, [win]).catch(() => []),
        db.queryOne(
            `SELECT COUNT(*)::int AS events,
                    COUNT(DISTINCT buyer_id)::int AS users,
                    COUNT(DISTINCT anon_id) FILTER (WHERE buyer_id IS NULL)::int AS anons
               FROM mkt_activity_event WHERE created_at > NOW() - $1::interval`,
            [win]
        ).catch(() => null),
        db.query(
            `SELECT to_char(date_trunc('hour', created_at), 'MM-DD HH24:00') AS bucket, COUNT(*)::int AS n
               FROM mkt_activity_event WHERE created_at > NOW() - interval '24 hours'
              GROUP BY 1 ORDER BY 1`
        ).catch(() => []),
    ]);
    return {
        feed: feed.map((r) => {
            let meta = r.meta;
            if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
            return { event: r.event, path: r.path || null, meta, at: r.created_at, who: r.display_name || r.alias || (r.buyer_id ? "Member" : "Anonymous"), anon: !r.display_name && !r.alias };
        }),
        topEvents: topEvents.map((r) => ({ event: r.event, n: r.n })),
        topPages: topPages.map((r) => ({ path: r.path, n: r.n })),
        totals: { events: totals?.events || 0, users: totals?.users || 0, anons: totals?.anons || 0 },
        hourly: hourly.map((r) => ({ bucket: r.bucket, n: r.n })),
    };
}
