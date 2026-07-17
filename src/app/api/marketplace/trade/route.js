import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { cancelTrade, listTrades, proposeTrade, respondTrade } from "@/lib/marketplace/trade.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the viewer's pending trade offers (incoming + outgoing).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/trade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore(await listTrades(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.trade.list.failure" });
        }
    });
}

// POST — action: propose | accept | decline | cancel.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/trade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            let res;
            if (action === "propose") res = await proposeTrade(buyer.id, body);
            else if (action === "accept") res = await respondTrade(buyer.id, String(body?.offerId || ""), "accept");
            else if (action === "decline") res = await respondTrade(buyer.id, String(body?.offerId || ""), "decline");
            else if (action === "cancel") res = await cancelTrade(buyer.id, String(body?.offerId || ""));
            else return noStore({ error: "unknown_action" }, { status: 400 });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.trade.action.failure" });
        }
    });
}
