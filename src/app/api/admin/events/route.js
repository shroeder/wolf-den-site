import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listAdminEventSummaries } from "@/lib/event-signups";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/events", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "events.manage", logger);

        if (authError) {
            return authError;
        }

        try {
            const events = await listAdminEventSummaries();

            return NextResponse.json(
                { events },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.events.list.failure",
            });
        }
    });
}
