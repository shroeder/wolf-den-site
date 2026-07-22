import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { COINS_PER_CENT, ONLINE_FEE_RATE, MIN_CREDIT_CENTS, MAX_CREDIT_CENTS, getStoreCredit, listStoreCreditEvents } from "@/lib/marketplace/store-credit.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { creditPurchaseBonus } from "@/lib/marketplace/signatures.js";
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
            const [balanceCents, events, equipped] = await Promise.all([
                getStoreCredit(buyer.id),
                listStoreCreditEvents(buyer.id, 20),
                getEquippedIds(buyer.id).catch(() => ({})),
            ]);
            return noStore({
                balanceCents,
                events,
                coinsPerCent: COINS_PER_CENT,
                feeRate: ONLINE_FEE_RATE,
                minCents: MIN_CREDIT_CENTS,
                maxCents: MAX_CREDIT_CENTS,
                coinBonus: creditPurchaseBonus(equipped), // fraction from equipped credit gear (0 if none)
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.credit.get.failure" });
        }
    });
}
