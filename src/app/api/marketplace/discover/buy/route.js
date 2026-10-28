import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discoverOpenFor } from "@/lib/marketplace/discover-gate.js";
import { buyNowWithCredit } from "@/lib/marketplace/discover-buy.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Buy one card outright with store credit; it lands in the vault. See discover-buy.js for why the order of
// operations is the whole safety argument.
//
// ⚠️ POST ONLY, and the idempotency key comes from the CLIENT so a double-tap or a retried request cannot
// charge twice. Nothing here is safe to repeat by accident.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/discover/buy", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !discoverOpenFor(buyer.id)) return noStore({ ok: false, error: "closed" }, { status: 403 });

            const body = await request.json().catch(() => ({}));
            const result = await buyNowWithCredit({
                buyerId: buyer.id,
                variationId: String(body?.variationId || "").trim(),
                idempotencyKey: String(body?.idempotencyKey || "").trim() || null,
            });
            return noStore(result, { status: result.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "discover.buy.failure" });
        }
    });
}
