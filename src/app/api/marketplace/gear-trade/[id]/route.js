import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { respondGearTrade } from "@/lib/marketplace/gear-trade.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — respond to a trade. Body: { action: "accept" | "decline" | "cancel" }.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/gear-trade/[id]", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const b = await request.json().catch(() => ({}));
            const res = await respondGearTrade(buyer.id, Number(id), String(b?.action || ""));
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.gear_trade.respond.failure" });
        }
    });
}
