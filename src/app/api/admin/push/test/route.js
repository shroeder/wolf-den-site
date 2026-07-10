import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { isPushEnabled, sendAdminPush } from "@/lib/push/send.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fires a test push to the owner's registered admin devices so push can be verified end-to-end.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/push/test", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            if (!isPushEnabled()) {
                return NextResponse.json(
                    { error: "Push isn't configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON not set)." },
                    { status: 400 }
                );
            }

            const result = await sendAdminPush({
                title: "🔔 Test notification",
                body: "Push is working — this is a test from your admin app.",
                route: "shopOrders",
                data: { test: "1" },
            });

            return NextResponse.json({ ok: true, ...result });
        } catch (error) {
            return internalError(error, { event: "admin.push.test.failure" });
        }
    });
}
