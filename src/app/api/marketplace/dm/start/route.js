import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getOrCreateDmThread } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Open (or create) a DM with a friend. Returns the thread id to navigate to.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/dm/start", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const result = await getOrCreateDmThread(buyer.id, String(body?.toUserId || ""));
            if (result.error) return noStore({ error: result.error }, { status: result.error === "not_friends" ? 403 : 400 });
            return noStore({ threadId: result.threadId });
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.start.failure" });
        }
    });
}
