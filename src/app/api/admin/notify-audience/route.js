import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getNotifyAudience } from "@/lib/admin/notify-audience.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner view of who we can actually REACH: browser push subscriptions (per device, incl. dead pre-rotation
// ones), phone-app FCM tokens, and members who granted precise browser geolocation.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/notify-audience", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await getNotifyAudience();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.notify_audience.failure" });
        }
    });
}
