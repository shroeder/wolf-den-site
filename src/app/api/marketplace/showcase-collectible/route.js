import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setFeaturedCollectible } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Feature one collectible on the member's card + public profile. Body: { id: "<collectible-id>" } to set,
// or { id: null } to clear. Must be a collectible they've unlocked at their level (validated server-side).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/showcase-collectible", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const profile = await setFeaturedCollectible(buyer.id, body?.id ?? null);
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.showcase_collectible.failure" });
        }
    });
}
