import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getStockadeState, placeInStockade, releaseFromStockade } from "@/lib/marketplace/stockade.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/stockade", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const state = await getStockadeState(null);
            // Past occupants too — "who has been in here and why" is the part worth keeping.
            const history = await db.query(
                `SELECT s.buyer_id, b.alias, s.reason, s.placed_at, s.released_at, s.shame_count, s.fruit_count
                   FROM mkt_stockade s JOIN mkt_buyer b ON b.id = s.buyer_id
                  ORDER BY s.placed_at DESC LIMIT 25`
            ).catch(() => []);
            return NextResponse.json({ ...state, history });
        } catch (error) {
            return internalError(error, { event: "admin.stockade.state.failure" });
        }
    });
}

// { action: "place", alias|buyerId, reason }  |  { action: "release", alias|buyerId }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/stockade", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            let targetId = b?.buyerId || null;
            if (!targetId && b?.alias) {
                const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE lower(alias) = lower($1)`, [String(b.alias)]).catch(() => null);
                targetId = row?.id || null;
            }
            if (!targetId) return NextResponse.json({ error: "member_not_found" }, { status: 404 });

            const res = b?.action === "release"
                ? await releaseFromStockade(targetId)
                : await placeInStockade(targetId, { reason: b?.reason || null });
            if (!res.ok) return NextResponse.json(res, { status: 400 });
            return NextResponse.json({ ...res, ...(await getStockadeState(null)) });
        } catch (error) {
            return internalError(error, { event: "admin.stockade.act.failure" });
        }
    });
}
