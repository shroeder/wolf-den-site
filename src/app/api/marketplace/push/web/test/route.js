import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid.js";
import { isWebPushEnabled, sendWebPush } from "@/lib/push/web-push.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Admin diagnostic: is browser push actually configured on the server (VAPID_PRIVATE_KEY present) and how
// many subscriptions exist? Lets the owner confirm the plumbing without needing a member session.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/push/web/test", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const total = await db.queryOne(`SELECT COUNT(*)::int AS c FROM mkt_web_push`).catch(() => null);
            return noStore({ configured: isWebPushEnabled(), subscriptions: total?.c ?? 0, publicKeyTail: VAPID_PUBLIC_KEY.slice(-8) });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.web.test.status.failure" });
        }
    });
}

// Fire a browser (Web Push) notification to the signed-in member's OWN subscribed browsers, so anyone can
// verify push works end-to-end on their device. The response says exactly what happened — whether the
// server has VAPID configured, whether this account has any subscriptions, and how many actually sent —
// which turns "I'm not getting notifications" into a concrete answer.
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
