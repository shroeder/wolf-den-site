import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { redeemChargeClaim } from "@/lib/marketplace/charge-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — staff scanned a member's charge QR in the admin app. Redeems the token: burns the charge and
// starts its cooldown, returning what to hand over + to whom. Body: { token, by }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/item-charges/claim", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const token = String(body?.token || "").trim();
            if (!token) return noStore({ error: "missing_token" }, { status: 400 });
            const res = await redeemChargeClaim(token, { by: String(body?.by || "admin").slice(0, 60) });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.item_charges.claim.failure" });
        }
    });
}
