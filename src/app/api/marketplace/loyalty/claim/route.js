import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { redeemLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Redeem a scan-to-earn loyalty claim for the signed-in buyer.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/loyalty/claim", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const token = String(body?.token || "").trim();
            if (!token) return noStore({ error: "missing_token" }, { status: 400 });
            const result = await redeemLoyaltyClaim(token, buyer.id);
            return noStore(result, { status: result.ok ? 200 : 409 });
        } catch (error) {
            return internalError(error, { event: "marketplace.loyalty.claim.failure" });
        }
    });
}
