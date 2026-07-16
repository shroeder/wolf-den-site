import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setShowcaseBadges } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Set the badges the member showcases on their card. Body: { slugs: ["<held-badge-slug>", ...] } (up to 3).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/showcase-badges", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const slugs = Array.isArray(body?.slugs) ? body.slugs : [];
            const profile = await setShowcaseBadges(buyer.id, slugs);
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.showcase_badges.failure" });
        }
    });
}
