import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyBadge, listBadgeShop } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — gold-priced badges + the member's gold.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/badge-shop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            return noStore(await listBadgeShop(buyer?.id || null));
        } catch (error) {
            return internalError(error, { event: "marketplace.badge_shop.get.failure" });
        }
    });
}

// POST — buy a gold-priced badge. Body: { slug }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/badge-shop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await buyBadge(buyer.id, String(body?.slug || "").trim());
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.badge_shop.buy.failure" });
        }
    });
}
