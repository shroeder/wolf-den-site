import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sendFriendRequest } from "@/lib/marketplace/friends.js";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Send a friend request by user id or @handle. If they already requested you, this accepts it.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/friends/request", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));

            let targetId = body?.userId ? String(body.userId) : null;
            if (!targetId && body?.alias) {
                const profile = await getPublicProfileByAlias(body.alias);
                targetId = profile?.id || null;
            }
            if (!targetId) return noStore({ error: "user_not_found" }, { status: 404 });

            const result = await sendFriendRequest(buyer.id, targetId);
            if (!result.ok) return noStore({ error: result.error || "failed" }, { status: 400 });
            return noStore({ ok: true, status: result.status });
        } catch (error) {
            return internalError(error, { event: "marketplace.friends.request.failure" });
        }
    });
}
