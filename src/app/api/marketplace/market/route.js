import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyFromMarket, cancelListing, getMarketState, listOnMarket } from "@/lib/marketplace/market.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/market", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return noStore(await getMarketState(buyer?.id || null));
        } catch (error) {
            return internalError(error, { event: "marketplace.market.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/market", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            // The owner gate lives in market.js, on every one of these — not here, and not on the screen. A
            // feature hidden in the UI and open at the API is not gated at all.
            switch (String(b?.action || "")) {
                case "list": return noStore(await listOnMarket(buyer.id, { ref: b.ref, qty: b.qty, unitGold: b.unitGold }));
                case "buy": return noStore(await buyFromMarket(buyer.id, b.id));
                case "cancel": return noStore(await cancelListing(buyer.id, b.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.market.act.failure" });
        }
    });
}
