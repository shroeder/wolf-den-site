import { NextResponse } from "next/server";

import { runEventReminders } from "@/lib/admin-app/event-reminders.js";
import { runPullQueueReminder } from "@/lib/admin-app/pull-queue-reminder.js";
import { runTimeclockReminders } from "@/lib/admin-app/timeclock-reminders.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nudges the employee to clock in/out around store hours. Safe to run often — the reminder state is keyed per
// Central day, so each nudge fires once (and the past-closing nag is rate-limited on its own clock).
// ?dryRun=1 reports exactly what it WOULD send without sending or recording anything.
//
// It ALSO carries the recurring store-event reminders (Magic at 4pm Friday) and the vault pull-queue
// reminder. They ride this job rather than
// getting a cron of their own because a UTC cron expression cannot express "4pm Central" — it would drift an
// hour at each DST change. This runs every 30 minutes and the event module checks the shop's own clock.
// One failure must not hide the other, so they are settled independently.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/timeclock-reminders", async ({ internalError }) => {
        try {
            const dryRun = ["1", "true", "yes"].includes(String(new URL(request.url).searchParams.get("dryRun") || "").toLowerCase());
            // ⚠️ allSettled, AND A THIRD RIDER. One failing module must never hide the other two — the comment
            // above says it for the first pair and it is just as true now that the vault queue is here. The
            // queue reminder fires in the same clock-in window and decides that for itself against the shop's
            // clock; see the long note in pull-queue-reminder.js for why it is not a branch inside the
            // timeclock module.
            const [clock, events, queue] = await Promise.allSettled([
                runTimeclockReminders({ dryRun }),
                runEventReminders({ dryRun }),
                runPullQueueReminder({ dryRun }),
            ]);
            return NextResponse.json({
                success: true,
                ...(clock.status === "fulfilled" ? clock.value : { clockError: String(clock.reason?.message || clock.reason) }),
                events: events.status === "fulfilled" ? events.value : { error: String(events.reason?.message || events.reason) },
                pullQueue: queue.status === "fulfilled" ? queue.value : { error: String(queue.reason?.message || queue.reason) },
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "timeclock_reminders.failure" });
        }
    });
}
