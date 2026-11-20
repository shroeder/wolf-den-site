import { NextResponse } from "next/server";

import { runEventReminders } from "@/lib/admin-app/event-reminders.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Store-event reminders on the QUARTER hours (:15 and :45). The half-hourly timeclock job still runs them on
// :00 and :30; between the two, an event set for 2:45 fires at 2:45 instead of fifteen minutes late. Sending
// twice is impossible: each event is guarded once per Central day in event-reminders.js.
// ?dryRun=1 reports what it WOULD send.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/event-reminders", async ({ internalError }) => {
        try {
            const dryRun = ["1", "true", "yes"].includes(String(new URL(request.url).searchParams.get("dryRun") || "").toLowerCase());
            return NextResponse.json({ success: true, ...(await runEventReminders({ dryRun })) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "event_reminders.failure" });
        }
    });
}
