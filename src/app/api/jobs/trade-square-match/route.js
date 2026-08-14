import { NextResponse } from "next/server";

import { matchTradesToSquareSales } from "@/lib/trades/square-match.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Links each trade to the Square sale that settled it — the sale happens on the POS after the phone app has
// already written the trade, so the order id can only be supplied afterwards.
//
// Attaching the order id is pure enrichment and always runs. MOVING MONEY does not: a recorded cash payout is
// only reclassified when the `trade.autofix_cash_to_applied` setting is "on", which it is not by default. Until
// then the job reports what it would move and flags the trade for review.
//
// ?dryRun=1 changes nothing at all, not even the link — for reading the report before trusting the job.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/trade-square-match", async ({ internalError }) => {
        try {
            const dryRun = ["1", "true", "yes"].includes(String(new URL(request.url).searchParams.get("dryRun") || "").toLowerCase());
            return NextResponse.json({ success: true, ...(await matchTradesToSquareSales({ dryRun })) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "trade_square_match.failure" });
        }
    });
}
