import { NextResponse } from "next/server";

import { markBadgeSeen, pendingBadge } from "@/lib/marketplace/badge-pop.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (b, i) => NextResponse.json(b, { ...i, headers: { "Cache-Control": "no-store", ...(i?.headers || {}) } });

// GET  → the oldest badge earned and never shown, if any.
// POST → mark one shown. Signed-out is not an error here, it is simply "nothing to show".
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/badge-pop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ badge: null });
            return noStore({ badge: await pendingBadge(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "badge_pop.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/badge-pop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ok: false }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            return noStore(await markBadgeSeen(buyer.id, String(b?.slug || "")));
        } catch (error) {
            return internalError(error, { event: "badge_pop.post.failure" });
        }
    });
}
