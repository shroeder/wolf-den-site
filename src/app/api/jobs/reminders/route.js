import { NextResponse } from "next/server";

import { runReminders } from "@/lib/admin-app/reminders.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner reminders — sales tax, rent, payroll. Safe to run often: each reminder claims today's date in the same
// conditional UPDATE that selects it, so overlapping runs can't double-send.
// ?dryRun=1 reports what it WOULD fire without sending or recording anything.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/reminders", async ({ internalError }) => {
        try {
            const dryRun = ["1", "true", "yes"].includes(String(new URL(request.url).searchParams.get("dryRun") || "").toLowerCase());
            return NextResponse.json({ success: true, ...(await runReminders({ dryRun })) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "reminders.failure" });
        }
    });
}
