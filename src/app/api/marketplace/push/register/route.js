import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { registerPushToken } from "@/lib/marketplace/push-tokens.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Register (upsert) this device's FCM token for the signed-in member, so DMs/friend requests can push.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/push/register", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const token = body?.token ? String(body.token) : "";
            if (!token.trim()) return noStore({ error: "missing_token" }, { status: 400 });
            await registerPushToken(buyer.id, token, body?.platform ? String(body.platform) : "android");
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.push.register.failure" });
        }
    });
}
