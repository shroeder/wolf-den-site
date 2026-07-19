import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listGearTrades, proposeGearTrade, tradeableItems } from "@/lib/marketplace/gear-trade.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's pending trades + their own tradeable items/gold (for the offer composer).
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/gear-trade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const [trades, mine] = await Promise.all([listGearTrades(buyer.id), tradeableItems(buyer.id)]);
            return noStore({ trades, myItems: mine.items, gold: mine.gold });
        } catch (error) {
            return internalError(error, { event: "marketplace.gear_trade.get.failure" });
        }
    });
}

// POST — propose a trade. Body: { targetId, requestedItemId, offeredItemIds?, offeredGold? }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/gear-trade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = await proposeGearTrade(buyer.id, String(b?.targetId || ""), String(b?.requestedItemId || ""), Array.isArray(b?.offeredItemIds) ? b.offeredItemIds : [], Number(b?.offeredGold) || 0);
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.gear_trade.propose.failure" });
        }
    });
}
