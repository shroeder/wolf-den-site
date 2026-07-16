import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setFeaturedBadge } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Set the member's PRIMARY badge (the folder tab). Body: { slug: "<held-badge-slug>" | null }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/featured-badge", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const slug = body?.slug ? String(body.slug) : null;
            const profile = await setFeaturedBadge(buyer.id, slug);
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.featured_badge.failure" });
        }
    });
}
