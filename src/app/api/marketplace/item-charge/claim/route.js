import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { createChargeClaim } from "@/lib/marketplace/charge-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — a member taps a ready in-store perk charge. Mints a single-use claim + returns its token so the
// app can show a QR to staff. Nothing is burned until staff scan it. Body: { itemId }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/item-charge/claim", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const itemId = String(body?.itemId || "").trim();
            if (!itemId) return noStore({ error: "missing_item" }, { status: 400 });
            const res = await createChargeClaim(buyer.id, itemId);
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.item_charge.claim.failure" });
        }
    });
}
