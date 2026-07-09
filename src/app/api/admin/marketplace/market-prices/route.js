import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk market-price lookup: POST { ids: [tcgIds] } -> { prices: { "<id>": marketPrice|null } }.
// Powers the admin "prices vs market" audit in one query instead of N per-item catalog calls.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/marketplace/market-prices", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const ids = Array.isArray(body.ids)
                ? [...new Set(body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)))]
                : [];
            if (ids.length === 0) {
                return NextResponse.json({ prices: {} });
            }
            const rows = await db.query(
                `SELECT id, market_price FROM tcg_cards WHERE id = ANY($1::bigint[])`,
                [ids]
            );
            const prices = {};
            for (const row of rows) {
                prices[String(row.id)] = row.market_price != null ? Number(row.market_price) : null;
            }
            return NextResponse.json({ prices });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.market_prices.failure" });
        }
    });
}
