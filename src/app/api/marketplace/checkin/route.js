import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getDailyCheckin, claimDailyCheckin } from "@/lib/marketplace/daily-checkin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the member's daily check-in (streak + claimable reward + while-you-were-away summary).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/checkin", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return NextResponse.json(await getDailyCheckin(buyer?.id || null), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.checkin.get.failure" });
        }
    });
}

// POST — claim today's streak reward.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/checkin", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const res = await claimDailyCheckin(buyer.id);
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.checkin.claim.failure" });
        }
    });
}
