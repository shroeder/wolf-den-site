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

            // ── Derived INSIGHT (activation funnel, growth trend, profile gaps, XP economy, store funnel, flags) ──
            const pct = (n, dn) => (dn ? Math.round((n / dn) * 100) : 0);
            const S = summary || {};
            const members = S.total_members || 0;
            const earning = S.earning_members || 0;
            const a7 = active?.active_7d || 0;
            const a30 = active?.active_30d || 0;
            const sig = (signups || []).map((r) => r.count || 0);
            const sig7 = sig.slice(-7).reduce((s, x) => s + x, 0);
            const sigPrev7 = sig.slice(-14, -7).reduce((s, x) => s + x, 0);
            const sigTrendPct = sigPrev7 > 0 ? Math.round(((sig7 - sigPrev7) / sigPrev7) * 100) : null;
            const fn = funnel || {};
            const totalActionPoints = (byAction || []).reduce((s, r) => s + Number(r.points || 0), 0);

            const flags = [];
            flags.push({ sev: earning >= members * 0.6 ? "good" : "warn", text: `${pct(earning, members)}% of members have earned XP (activation) — ${earning} of ${members}.` });
            flags.push({ sev: a7 >= members * 0.3 ? "good" : "warn", text: `Weekly active: ${a7} of ${members} (${pct(a7, members)}%). Monthly active: ${a30} (${pct(a30, members)}%).` });
            if (sigTrendPct != null) flags.push({ sev: sigTrendPct >= 0 ? "good" : "warn", text: `${sig7} new members in the last 7 days (${sigTrendPct >= 0 ? "+" : ""}${sigTrendPct}% vs ${sigPrev7} the prior week).` });
            else flags.push({ sev: "info", text: `${sig7} new members in the last 7 days.` });
            if (fn.claims_created > 0) flags.push({ sev: "info", text: `In-store QR: ${fn.claims_created} claims shown, ${fn.claims_redeemed} redeemed (${pct(fn.claims_redeemed, fn.claims_created)}% redemption).` });
            if (fn.pending_purchases > 0) flags.push({ sev: "warn", text: `${fn.pending_purchases} store-credit purchases are waiting to be claimed.` });
            if (pct(S.discord_linked, members) < 40) flags.push({ sev: "info", text: `Only ${pct(S.discord_linked, members)}% have linked Discord — a reach gap for announcements.` });

            const insights = {
                kpis: {
                    activationPct: pct(earning, members),
                    weeklyActivePct: pct(a7, members),
                    monthlyActivePct: pct(a30, members),
                    new7d: S.new_7d || 0,
                    signups7d: sig7,
                    signupTrendPct: sigTrendPct,
                },
                funnel: [
                    { label: "Members", value: members, pct: 100 },
                    { label: "Earned XP", value: earning, pct: pct(earning, members) },
                    { label: "Active 30d", value: a30, pct: pct(a30, members) },
                    { label: "Active 7d", value: a7, pct: pct(a7, members) },
                ],
                profile: [
                    { label: "Has @handle", n: S.with_handle || 0, pct: pct(S.with_handle, members) },
                    { label: "Has avatar", n: S.with_avatar || 0, pct: pct(S.with_avatar, members) },
                    { label: "Discord linked", n: S.discord_linked || 0, pct: pct(S.discord_linked, members) },
                    { label: "Phone on file", n: S.phone_on_file || 0, pct: pct(S.phone_on_file, members) },
                    { label: "Square linked", n: S.square_linked || 0, pct: pct(S.square_linked, members) },
                ],
                xpSources: (byAction || []).slice(0, 6).map((r) => ({ action: r.action, points: Number(r.points || 0), pct: pct(Number(r.points || 0), totalActionPoints) })),
                store: {
                    claimsCreated: fn.claims_created || 0,
                    claimsRedeemed: fn.claims_redeemed || 0,
                    claimRedeemPct: pct(fn.claims_redeemed, fn.claims_created),
                    pendingPurchases: fn.pending_purchases || 0,
                    redeemedPurchases: fn.redeemed_purchases || 0,
                },
                flags,
            };

            const body = {
                insights,
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
