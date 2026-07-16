import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Save (upsert) this browser's Web Push subscription for the signed-in member, so DMs / friend
// requests / badges can push to the desktop or browser. Keyed by endpoint (globally unique), so a
// re-subscribe on the same browser updates in place and moves the endpoint to the current account.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/push/web/subscribe", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });

            const body = await request.json().catch(() => ({}));
            const sub = body?.subscription;
            const endpoint = sub?.endpoint ? String(sub.endpoint) : "";
            const p256dh = sub?.keys?.p256dh ? String(sub.keys.p256dh) : "";
            const auth = sub?.keys?.auth ? String(sub.keys.auth) : "";
            if (!endpoint || !p256dh || !auth) return noStore({ error: "invalid_subscription" }, { status: 400 });

            const userAgent = body?.userAgent ? String(body.userAgent).slice(0, 300) : null;

            await db.query(
                `INSERT INTO mkt_web_push (buyer_id, endpoint, p256dh, auth, user_agent)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (endpoint) DO UPDATE
                   SET buyer_id = EXCLUDED.buyer_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                       user_agent = EXCLUDED.user_agent, last_used_at = NOW()`,
                [buyer.id, endpoint, p256dh, auth, userAgent]
            );

            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.web.subscribe.failure" });
        }
    });
}
