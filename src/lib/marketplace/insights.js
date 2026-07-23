import "server-only";

import { db } from "@/lib/db";

// Engagement / funnel / retention insights for the admin "Insights" dashboard. All read-only aggregates over
// the telemetry tables (mkt_activity_event, mkt_visitor, mkt_buyer). One call returns everything the charts need.
export async function siteInsights() {
    const [overview, signups, sources, features, funnel, stickiness, retention, trend, landing] = await Promise.all([
        // Members + anonymous funnel overview.
        db.queryOne(`SELECT
            (SELECT COUNT(*) FROM mkt_buyer)::int AS members,
            (SELECT COUNT(*) FROM mkt_buyer WHERE last_seen_at > NOW()-INTERVAL '7 days')::int AS active_7d,
            (SELECT COUNT(*) FROM mkt_buyer WHERE last_seen_at > NOW()-INTERVAL '30 days')::int AS active_30d,
            (SELECT COUNT(*) FROM mkt_visitor)::int AS anon_visitors,
            (SELECT COUNT(*) FROM mkt_visitor WHERE events<=1)::int AS bounced,
            (SELECT COUNT(*) FROM mkt_visitor WHERE buyer_id IS NOT NULL)::int AS converted`).catch(() => null),
        // Signups per week (last 10).
        db.query(`SELECT to_char(date_trunc('week',created_at),'MM-DD') AS label, COUNT(*)::int AS n
                    FROM mkt_buyer WHERE created_at > NOW()-INTERVAL '10 weeks' GROUP BY date_trunc('week',created_at) ORDER BY 1`).catch(() => []),
        // Traffic source mix.
        db.query(`SELECT COALESCE(NULLIF(source_kind,''),'direct') AS kind, COUNT(*)::int AS n
                    FROM mkt_visitor GROUP BY 1 ORDER BY n DESC LIMIT 8`).catch(() => []),
        // Feature adoption (distinct members per event, last 30d) — excludes pure navigation noise.
        db.query(`SELECT event, COUNT(*)::int AS n, COUNT(DISTINCT buyer_id)::int AS members
                    FROM mkt_activity_event
                   WHERE buyer_id IS NOT NULL AND created_at > NOW()-INTERVAL '30 days'
                     AND event NOT IN ('page_view','view_profile','inspect_item','browse_shop','shop_search','shop_filter')
                   GROUP BY event ORDER BY members DESC, n DESC LIMIT 18`).catch(() => []),
        // Key funnels (all-time distinct members).
        db.queryOne(`SELECT
            (SELECT COUNT(DISTINCT buyer_id) FROM mkt_activity_event WHERE event='view_boss' AND buyer_id IS NOT NULL)::int AS boss_viewed,
            (SELECT COUNT(DISTINCT buyer_id) FROM mkt_activity_event WHERE event='boss_attack')::int AS boss_attacked,
            (SELECT COUNT(DISTINCT buyer_id) FROM mkt_activity_event WHERE event='sail_voyage')::int AS sail_voyaged,
            (SELECT COUNT(DISTINCT buyer_id) FROM mkt_activity_event WHERE event='sail_dig')::int AS sail_dug`).catch(() => null),
        // Stickiness: how many distinct days each member was active in the last 14.
        db.query(`SELECT active_days, COUNT(*)::int AS members FROM (
                    SELECT buyer_id, COUNT(DISTINCT (created_at AT TIME ZONE 'America/Chicago')::date) AS active_days
                      FROM mkt_activity_event WHERE buyer_id IS NOT NULL AND created_at > NOW()-INTERVAL '14 days' GROUP BY buyer_id
                  ) t GROUP BY active_days ORDER BY active_days`).catch(() => []),
        // New-member retention: of members who joined 2+ days ago, how many were active in the last 2 days.
        db.queryOne(`SELECT COUNT(*)::int AS cohort, COUNT(*) FILTER (WHERE last_seen_at > NOW()-INTERVAL '2 days')::int AS still_active
                       FROM mkt_buyer WHERE created_at < NOW()-INTERVAL '2 days'`).catch(() => null),
        // Daily trend (last 14 days): events + distinct active members.
        db.query(`SELECT to_char((created_at AT TIME ZONE 'America/Chicago')::date,'MM-DD') AS label,
                         COUNT(*)::int AS events, COUNT(DISTINCT buyer_id)::int AS members
                    FROM mkt_activity_event WHERE created_at > NOW()-INTERVAL '14 days'
                   GROUP BY (created_at AT TIME ZONE 'America/Chicago')::date ORDER BY 1`).catch(() => []),
        // Landing pages + how they convert / bounce (min 6 visitors).
        db.query(`SELECT landing_path AS path, COUNT(*)::int AS visitors,
                         COUNT(*) FILTER (WHERE buyer_id IS NOT NULL)::int AS converted,
                         COUNT(*) FILTER (WHERE events<=1)::int AS bounced
                    FROM mkt_visitor WHERE landing_path IS NOT NULL GROUP BY landing_path
                  HAVING COUNT(*) >= 6 ORDER BY visitors DESC LIMIT 12`).catch(() => []),
    ]);

    const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0);
    return {
        overview: {
            members: overview?.members || 0,
            active7d: overview?.active_7d || 0,
            active30d: overview?.active_30d || 0,
            anonVisitors: overview?.anon_visitors || 0,
            bouncePct: pct(overview?.bounced || 0, overview?.anon_visitors || 0),
            conversionPct: pct(overview?.converted || 0, overview?.anon_visitors || 0),
        },
        signups: signups.map((r) => ({ label: r.label, n: r.n })),
        sources: sources.map((r) => ({ kind: r.kind, n: r.n })),
        features: features.map((r) => ({ event: r.event, n: r.n, members: r.members })),
        funnel: {
            bossViewed: funnel?.boss_viewed || 0,
            bossAttacked: funnel?.boss_attacked || 0,
            sailVoyaged: funnel?.sail_voyaged || 0,
            sailDug: funnel?.sail_dug || 0,
        },
        stickiness: stickiness.map((r) => ({ days: Number(r.active_days), members: r.members })),
        retention: { cohort: retention?.cohort || 0, stillActive: retention?.still_active || 0, pct: pct(retention?.still_active || 0, retention?.cohort || 0) },
        trend: trend.map((r) => ({ label: r.label, events: r.events, members: r.members })),
        landing: landing.map((r) => ({ path: r.path, visitors: r.visitors, converted: r.converted, bounced: r.bounced })),
    };
}
