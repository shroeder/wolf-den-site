import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { lookupCreditClaim } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — staff scanned a member's store-credit QR. PEEK only (does not consume the token): returns who the
// member is + their current balance, so staff know the ceiling before entering an amount. Body: { token }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/store-credit/lookup", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const token = String(body?.token || "").trim();
            if (!token) return noStore({ error: "missing_token" }, { status: 400 });
            const res = await lookupCreditClaim(token);
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.lookup.failure" });
        }
    });
}
