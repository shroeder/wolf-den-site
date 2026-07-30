import { NextResponse } from "next/server";

import { runTimeclockReminders } from "@/lib/admin-app/timeclock-reminders.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nudges the employee to clock in/out around store hours. Safe to run often — the reminder state is keyed per
// Central day, so each nudge fires once (and the past-closing nag is rate-limited on its own clock).
// ?dryRun=1 reports exactly what it WOULD send without sending or recording anything.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/timeclock-reminders", async ({ internalError }) => {
        try {
            const dryRun = ["1", "true", "yes"].includes(String(new URL(request.url).searchParams.get("dryRun") || "").toLowerCase());
            return NextResponse.json({ success: true, ...(await runTimeclockReminders({ dryRun })) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "timeclock_reminders.failure" });
        }
    });
}
