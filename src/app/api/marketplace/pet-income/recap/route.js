import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getIncomeRecap } from "@/lib/marketplace/pet-income.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the once-a-day "your pets earned X while you were away" recap (or { show:false }).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/pet-income/recap", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ show: false }, { headers: { "Cache-Control": "no-store" } });
            return NextResponse.json(await getIncomeRecap(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pet_income.recap.failure" });
        }
    });
}
