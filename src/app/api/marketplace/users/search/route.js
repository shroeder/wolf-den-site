import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { searchUsers } from "@/lib/marketplace/friends.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Search members by @handle or name (for adding friends). Annotated with the viewer's relationship.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/users/search", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const q = new URL(request.url).searchParams.get("q") || "";
            return noStore({ results: await searchUsers(q, buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.users.search.failure" });
        }
    });
}
