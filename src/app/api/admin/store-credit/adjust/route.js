import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { adminAdjust } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — owner/staff manually adjust a member's store credit and/or coins (e.g. fix a mistake, comp credit,
// reverse a top-up). Both deltas are signed; credit flows through the ledger. Body:
// { buyerId, creditDeltaCents, coinsDelta, reason }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/store-credit/adjust", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            if (!buyerId) return noStore({ error: "missing_buyer" }, { status: 400 });
            const creditDeltaCents = Math.round(Number(body?.creditDeltaCents) || 0);
            const coinsDelta = Math.round(Number(body?.coinsDelta) || 0);
            if (creditDeltaCents === 0 && coinsDelta === 0) return noStore({ error: "no_change" }, { status: 400 });
            const reason = String(body?.reason || "admin adjust").slice(0, 200);
            // A manual in-store redemption records as a real "spend_store" ledger row (reads "Spent in store"),
            // not a generic adjustment, so member history stays truthful.
            const creditReason = creditDeltaCents < 0 && /in.?store|spend|redeem/i.test(reason) ? "spend_store" : "adjust";
            const res = await adminAdjust(buyerId, {
                creditDeltaCents,
                coinsDelta,
                reason,
                by: String(body?.by || "admin").slice(0, 60),
                creditReason,
            });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.adjust.failure" });
        }
    });
}
