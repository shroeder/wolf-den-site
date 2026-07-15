import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listFriends, listPending } from "@/lib/marketplace/friends.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// The signed-in user's friends + pending requests (incoming/outgoing).
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/friends", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const [friends, pending] = await Promise.all([listFriends(buyer.id), listPending(buyer.id)]);
            return noStore({ friends, incoming: pending.incoming, outgoing: pending.outgoing });
        } catch (error) {
            return internalError(error, { event: "marketplace.friends.list.failure" });
        }
    });
}
