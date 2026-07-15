import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { removeFriend, respondToRequest } from "@/lib/marketplace/friends.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Accept/decline an incoming request, or remove a friend / cancel an outgoing request.
//   { action: "accept"|"decline", requestId }   — respond to an incoming request
//   { action: "remove", userId }                — unfriend or cancel an outgoing request
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/friends/respond", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");

            if (action === "accept" || action === "decline") {
                const result = await respondToRequest(buyer.id, String(body?.requestId || ""), action === "accept");
                return noStore(result, { status: result.ok ? 200 : 400 });
            }
            if (action === "remove") {
                const result = await removeFriend(buyer.id, String(body?.userId || ""));
                return noStore(result);
            }
            return noStore({ error: "bad_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.friends.respond.failure" });
        }
    });
}
