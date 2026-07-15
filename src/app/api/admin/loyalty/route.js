import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function label(row) {
    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    return name || row.alias || row.display_name || "Member";
}

// Owner loyalty dashboard: membership + engagement + XP telemetry for the admin app.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/loyalty", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "loyalty.view", logger);
        if (authError) return authError;

        try {
            const [summary, active, signups, byAction, leaderboard, funnel, recent] = await Promise.all([
                db.queryOne(`
                    SELECT
                        COUNT(*)::int AS total_members,
                        COUNT(*) FILTER (WHERE alias IS NOT NULL)::int AS with_handle,
                        COUNT(*) FILTER (WHERE avatar_url IS NOT NULL)::int AS with_avatar,
                        COUNT(*) FILTER (WHERE discord_user_id IS NOT NULL)::int AS discord_linked,
                        COUNT(*) FILTER (WHERE phone IS NOT NULL)::int AS phone_on_file,
                        COUNT(*) FILTER (WHERE square_customer_id IS NOT NULL)::int AS square_linked,
                        COUNT(*) FILTER (WHERE COALESCE(xp, 0) > 0)::int AS earning_members,
                        COALESCE(SUM(xp), 0)::bigint AS total_xp,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d
                    FROM mkt_buyer
                `),
                db.queryOne(`
                    SELECT
                        COUNT(DISTINCT buyer_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS active_7d,
                        COUNT(DISTINCT buyer_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS active_30d
                    FROM mkt_xp_event
                `),
                db.query(`
                    SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS count
                    FROM generate_series(
                        (NOW() AT TIME ZONE 'America/Chicago')::date - INTERVAL '29 days',
                        (NOW() AT TIME ZONE 'America/Chicago')::date,
                        INTERVAL '1 day'
                    ) d
                    LEFT JOIN (
                        SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS day, COUNT(*) AS n
                        FROM mkt_buyer WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
                    ) c ON c.day = d::date
                    ORDER BY d
                `),
                db.query(`
                    SELECT action,
                           COUNT(*)::int AS events,
                           COALESCE(SUM(points), 0)::bigint AS points,
                           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS events_30d
                    FROM mkt_xp_event GROUP BY action ORDER BY points DESC
                `),
                db.query(`
                    SELECT alias, first_name, last_name, display_name, COALESCE(xp, 0) AS xp
                    FROM mkt_buyer WHERE COALESCE(xp, 0) > 0
                    ORDER BY xp DESC, updated_at ASC LIMIT 25
                `),
                db.queryOne(`
                    SELECT
                        (SELECT COUNT(*) FROM mkt_pending_purchase WHERE redeemed_at IS NULL)::int AS pending_purchases,
                        (SELECT COUNT(*) FROM mkt_pending_purchase WHERE redeemed_at IS NOT NULL)::int AS redeemed_purchases,
                        (SELECT COUNT(*) FROM mkt_loyalty_claim)::int AS claims_created,
                        (SELECT COUNT(*) FROM mkt_loyalty_claim WHERE redeemed_at IS NOT NULL)::int AS claims_redeemed
                `).catch(() => ({ pending_purchases: 0, redeemed_purchases: 0, claims_created: 0, claims_redeemed: 0 })),
                db.query(`
                    SELECT e.action, e.points, e.created_at, b.alias, b.first_name, b.last_name, b.display_name
                    FROM mkt_xp_event e JOIN mkt_buyer b ON b.id = e.buyer_id
                    ORDER BY e.created_at DESC LIMIT 25
                `),
            ]);

            const body = {
                summary: {
                    totalMembers: summary?.total_members || 0,
                    withHandle: summary?.with_handle || 0,
                    withAvatar: summary?.with_avatar || 0,
                    discordLinked: summary?.discord_linked || 0,
                    phoneOnFile: summary?.phone_on_file || 0,
                    squareLinked: summary?.square_linked || 0,
                    earningMembers: summary?.earning_members || 0,
                    totalXp: Number(summary?.total_xp || 0),
                    new7d: summary?.new_7d || 0,
                    new30d: summary?.new_30d || 0,
                    active7d: active?.active_7d || 0,
                    active30d: active?.active_30d || 0,
                },
                signups: (signups || []).map((r) => ({ day: r.day, count: r.count })),
                byAction: (byAction || []).map((r) => ({
                    action: r.action,
                    events: r.events,
                    points: Number(r.points || 0),
                    events30d: r.events_30d,
                })),
                leaderboard: (leaderboard || []).map((r, i) => ({
                    rank: i + 1,
                    label: label(r),
                    alias: r.alias || null,
                    level: levelForXp(r.xp || 0).level,
                    xp: Number(r.xp || 0),
                })),
                funnel: {
                    pendingPurchases: funnel?.pending_purchases || 0,
                    redeemedPurchases: funnel?.redeemed_purchases || 0,
                    claimsCreated: funnel?.claims_created || 0,
                    claimsRedeemed: funnel?.claims_redeemed || 0,
                },
                recent: (recent || []).map((r) => ({
                    action: r.action,
                    points: r.points,
                    label: label(r),
                    at: r.created_at,
                })),
            };

            return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.loyalty.failure" });
        }
    });
}
