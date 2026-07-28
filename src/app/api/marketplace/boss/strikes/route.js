import { NextResponse } from "next/server";

import { getBossStrikesLeft } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight: how many boss strikes the member still has today — powers the nav "strikes ready" badge.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/boss/strikes", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ attacksLeft: 0 }, { headers: { "Cache-Control": "no-store" } });
            const attacksLeft = await getBossStrikesLeft(buyer.id).catch(() => 0);
            return NextResponse.json({ attacksLeft }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.boss.strikes.failure" });
        }
    });
}
