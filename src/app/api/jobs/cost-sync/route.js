import { NextResponse } from "next/server";

import { sweepCostSync } from "@/lib/cogs/cost-sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serial Square writes with a read-back each; a full queue after a seed is minutes of work, not seconds.
export const maxDuration = 300;

// Push the costs Square is not carrying, a batch at a time. Hourly rather than at restock time on purpose:
// the restock's job is to book the purchase, and making it wait on a catalog write is what led to the write
// being fire-and-forget in the first place. Anything that fails here stays a visible row and is retried with
// a growing back-off, so a Square outage costs a delay instead of a cost.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/cost-sync", async ({ internalError }) => {
        try {
            const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get("limit")) || 40));
            const result = await sweepCostSync({ limit });
            return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "cost_sync.job.failure" });
        }
    });
}
