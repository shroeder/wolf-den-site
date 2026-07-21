import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { redeemCreditClaim } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — staff deduct store credit for an in-store purchase. Atomically consumes the single-use token and
// spends the amount from the member's balance. Returns the new balance + the dollar amount to discount on
// the Square terminal. Body: { token, amountCents, by }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/store-credit/redeem", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const token = String(body?.token || "").trim();
            const amountCents = Math.round(Number(body?.amountCents) || 0);
            if (!token) return noStore({ error: "missing_token" }, { status: 400 });
            if (amountCents <= 0) return noStore({ error: "bad_amount" }, { status: 400 });
            const res = await redeemCreditClaim(token, amountCents, { by: String(body?.by || "admin").slice(0, 60) });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.redeem.failure" });
        }
    });
}
