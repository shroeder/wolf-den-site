import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { COINS_PER_CENT, ONLINE_FEE_RATE, MIN_CREDIT_CENTS, MAX_CREDIT_CENTS, getStoreCredit, listStoreCreditEvents } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's current store-credit balance + recent ledger, plus the economy constants the buy UI
// needs (coins-per-cent, fee rate, min/max). Used to refresh the page after a purchase.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/credit", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const [balanceCents, events] = await Promise.all([getStoreCredit(buyer.id), listStoreCreditEvents(buyer.id, 20)]);
            return noStore({
                balanceCents,
                events,
                coinsPerCent: COINS_PER_CENT,
                feeRate: ONLINE_FEE_RATE,
                minCents: MIN_CREDIT_CENTS,
                maxCents: MAX_CREDIT_CENTS,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.credit.get.failure" });
        }
    });
}
