import { NextResponse } from "next/server";

import { listUpcomingEvents } from "@/lib/marketplace/events.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public: upcoming events for the phone app (name, date, location, attending vendor count).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/events", async ({ internalError }) => {
        try {
            const events = await listUpcomingEvents();
            return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.events.list.failure" });
        }
    });
}
