import { NextResponse } from "next/server";

import { syncCashRefunds } from "@/lib/admin-app/cash-refunds.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Square cash refunds → the cash ledger. Safe to run often: every row is keyed square-refund-<id> and skipped
// if it's already there. ?dryRun=1 reports what it WOULD add. ?days=N widens the lookback for a backfill.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/cash-refunds", async ({ internalError }) => {
        try {
            const q = new URL(request.url).searchParams;
            const dryRun = ["1", "true", "yes"].includes(String(q.get("dryRun") || "").toLowerCase());
            const lookbackDays = Math.max(1, Math.min(400, Number(q.get("days")) || 30));
            return NextResponse.json({ success: true, ...(await syncCashRefunds({ dryRun, lookbackDays })) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "cash_refunds.failure" });
        }
    });
}
