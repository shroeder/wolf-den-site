import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getUnseenRaidDefenses } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The "you got raided (and won)" welcome-back report. Fetching it marks the entries seen, so it pops once.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/raid-defense", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ defenses: [], totalGold: 0, totalWins: 0 }, { headers: { "Cache-Control": "no-store" } });
            const report = await getUnseenRaidDefenses(buyer.id);
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.raid_defense.failure" });
        }
    });
}
