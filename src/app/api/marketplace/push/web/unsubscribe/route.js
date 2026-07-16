import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Forget this browser's Web Push subscription. Scoped to the signed-in member so one account can't drop
// another's subscription.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/push/web/unsubscribe", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });

            const body = await request.json().catch(() => ({}));
            const endpoint = body?.endpoint ? String(body.endpoint) : "";
            if (!endpoint) return noStore({ error: "missing_endpoint" }, { status: 400 });

            await db.query(`DELETE FROM mkt_web_push WHERE endpoint = $1 AND buyer_id = $2`, [endpoint, buyer.id]);
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.web.unsubscribe.failure" });
        }
    });
}
