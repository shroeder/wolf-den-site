import { NextResponse } from "next/server";

import { broadcastChangelog, getChangelog } from "@/lib/marketplace/changelog-server.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (b, i) => NextResponse.json(b, { ...i, headers: { "Cache-Control": "no-store", ...(i?.headers || {}) } });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/changelog", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const owner = isOwner(buyer?.id);
            return noStore({ entries: await getChangelog(owner), owner });
        } catch (error) {
            return internalError(error, { event: "changelog.get.failure" });
        }
    });
}

// Posting to the den channel is OWNER-ONLY. A changelog anybody could broadcast is a spam button.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/changelog", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!isOwner(buyer?.id)) return noStore({ error: "forbidden" }, { status: 403 });
            const b = await request.json().catch(() => ({}));
            const res = await broadcastChangelog(String(b?.key || ""));
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "changelog.post.failure" });
        }
    });
}
