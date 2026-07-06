import { NextResponse } from "next/server";

import { getMarketplacePulse } from "@/lib/marketplace/pulse.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Browse-home activity pulse: trending searches, just-listed products, headline counts. Public.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/pulse", async ({ internalError }) => {
        try {
            const pulse = await getMarketplacePulse();
            return NextResponse.json(pulse, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pulse.failure" });
        }
    });
}
