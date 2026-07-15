import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { unregisterPushToken } from "@/lib/marketplace/push-tokens.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Drop this device's FCM token on sign-out so a logged-out phone stops receiving the member's pushes.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/push/unregister", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const token = body?.token ? String(body.token) : "";
            if (token.trim()) await unregisterPushToken(buyer.id, token);
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.unregister.failure" });
        }
    });
}
