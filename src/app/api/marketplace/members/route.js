import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listMembers } from "@/lib/marketplace/friends.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Browseable member directory (tiles) for the Friends page. Optional ?q= filter; ?offset= to page.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/members", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const url = new URL(request.url);
            const q = url.searchParams.get("q") || "";
            const offset = Number(url.searchParams.get("offset")) || 0;
            const members = await listMembers(buyer.id, { q, limit: 60, offset });
            return noStore({ members });
        } catch (error) {
            return internalError(error, { event: "marketplace.members.list.failure" });
        }
    });
}
