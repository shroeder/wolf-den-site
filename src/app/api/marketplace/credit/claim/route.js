import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { createCreditClaim } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — a member wants to spend store credit in-store. Mints a single-use claim + returns its token so the
// page can show a QR to staff. Nothing is deducted until staff scan it and enter an amount.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/credit/claim", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const res = await createCreditClaim(buyer.id);
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.credit.claim.failure" });
        }
    });
}
