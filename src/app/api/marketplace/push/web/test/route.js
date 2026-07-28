import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isWebPushEnabled, sendWebPush } from "@/lib/push/web-push.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Fire a browser (Web Push) notification to the signed-in member's OWN subscribed browsers, so anyone can
// verify push works end-to-end on their device (powers the "Send test" button in the notifications toggle).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/push/web/test", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });

            if (!isWebPushEnabled()) {
                return noStore({ ok: false, configured: false, reason: "not_configured", message: "Web push isn't configured on the server (VAPID_PRIVATE_KEY is not set)." });
            }

            const result = await sendWebPush(buyer.id, {
                title: "🔔 Wolf Den test",
                body: "If you can see this, browser notifications are working on this device.",
                url: "/marketplace/messages",
                tag: "wolfden-test",
                data: { type: "test" },
            });

            return noStore({ ok: (result.sent || 0) > 0, configured: true, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.web.test.failure" });
        }
    });
}
