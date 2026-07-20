import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getDailyDeals, buyDailyDeal } from "@/lib/marketplace/daily-deals.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — today's rotating deals for the signed-in member (with claimed/owned/affordable flags + countdown).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/deals", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return NextResponse.json(await getDailyDeals(buyer?.id || null), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.deals.list.failure" });
        }
    });
}

// POST { dealId } — claim one of today's deals.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/deals", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await buyDailyDeal(buyer.id, String(body?.dealId || ""));
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.deals.buy.failure" });
        }
    });
}
