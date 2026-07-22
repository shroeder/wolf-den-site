import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { listStoreCreditEvents } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET ?buyerId= — one member's full store-credit transaction ledger (purchases, in-store & online spends,
// refunds, manual adjusts), each with the running balance, plus lifetime purchased total + current balance.
// Admin-gated. Backs the drill-in on the Store Credit accounts list.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/store-credit/history", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const buyerId = String(searchParams.get("buyerId") || "").trim();
            if (!buyerId) return noStore({ error: "missing_buyerId" }, { status: 400 });

            const [member, events, agg] = await Promise.all([
                db.queryOne(
                    `SELECT COALESCE(display_name, alias, first_name, email, 'Member') AS name,
                            email,
                            COALESCE(store_credit_cents, 0) AS balance_cents
                       FROM mkt_buyer WHERE id = $1`,
                    [buyerId]
                ).catch(() => null),
                listStoreCreditEvents(buyerId, 100),
                db.queryOne(
                    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total_cents, COUNT(*)::int AS n
                       FROM mkt_credit_purchase WHERE buyer_id = $1 AND status = 'paid'`,
                    [buyerId]
                ).catch(() => null),
            ]);

            return noStore({
                member: {
                    name: member?.name || "Member",
                    email: member?.email || null,
                    balanceCents: Number(member?.balance_cents) || 0,
                },
                purchasedTotalCents: Number(agg?.total_cents) || 0,
                purchaseCount: Number(agg?.n) || 0,
                events, // [{ deltaCents, balanceCents, reason, ref, at }] newest-first
            });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.history.failure" });
        }
    });
}
