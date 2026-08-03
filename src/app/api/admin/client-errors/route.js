import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every page crash a member has hit, newest first, for the admin app's Crashes screen.
//
// The push that announces a crash used to deep-link to `marketplace`, which is the VENDOR screen — so the
// alert told you something broke and then took you somewhere that could not tell you what. This is the
// destination it should have had: the message, the path, who hit it, and the stack, with a copy button.
//
// GROUPED by path+message, because a real break is not one report — it is the same report forty times from
// eight members, and forty rows of the same thing hides the second, different break underneath it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/client-errors", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const rows = await db.query(
                `SELECT MIN(e.id)                       AS id,
                        e.path,
                        e.message,
                        COUNT(*)::int                   AS hits,
                        COUNT(DISTINCT e.buyer_id)::int AS members,
                        MAX(e.created_at)               AS last_at,
                        MIN(e.created_at)               AS first_at,
                        (ARRAY_AGG(e.digest ORDER BY e.created_at DESC) FILTER (WHERE e.digest IS NOT NULL))[1] AS digest,
                        (ARRAY_AGG(e.stack  ORDER BY e.created_at DESC) FILTER (WHERE e.stack  IS NOT NULL))[1] AS stack,
                        (ARRAY_AGG(e.ua     ORDER BY e.created_at DESC) FILTER (WHERE e.ua     IS NOT NULL))[1] AS ua,
                        (ARRAY_AGG(COALESCE(b.display_name, b.alias) ORDER BY e.created_at DESC)
                            FILTER (WHERE b.id IS NOT NULL))[1] AS who
                   FROM mkt_client_error e
                   LEFT JOIN mkt_buyer b ON b.id = e.buyer_id
                  WHERE e.created_at > NOW() - INTERVAL '30 days'
                  GROUP BY e.path, e.message
                  ORDER BY MAX(e.created_at) DESC
                  LIMIT 100`
            ).catch(() => []);

            const [tot] = await db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS today
                   FROM mkt_client_error`
            ).catch(() => [{ total: 0, today: 0 }]);

            return NextResponse.json({
                ok: true,
                summary: { total: tot?.total || 0, today: tot?.today || 0, groups: rows.length },
                errors: rows.map((r) => ({
                    id: Number(r.id),
                    path: r.path,
                    message: r.message,
                    hits: r.hits,
                    members: r.members,
                    who: r.who || null,
                    digest: r.digest || null,
                    stack: r.stack || null,
                    ua: r.ua || null,
                    lastAt: r.last_at,
                    firstAt: r.first_at,
                })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error);
        }
    });
}
