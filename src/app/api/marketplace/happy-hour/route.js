import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getHappyHourState, donateToHappyHour } from "@/lib/marketplace/happy-hour.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the active Happy Hour state (multiplier, pool, next breakpoint, your donation). { active:false } if none.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/happy-hour", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return NextResponse.json(await getHappyHourState(buyer?.id || null), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.happyhour.get.failure" });
        }
    });
}

// POST { amount } — donate gold into the pool.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/happy-hour", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await donateToHappyHour(buyer.id, body?.amount);
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.happyhour.donate.failure" });
        }
    });
}
