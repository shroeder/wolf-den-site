import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CLIENT_EVENTS, trackActivity } from "@/lib/marketplace/activity.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — log a client-side activity event. Body: { event, meta? }. Only whitelisted client events are
// accepted (server-side actions log themselves). Silent no-op when signed out.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/track", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return NextResponse.json({ ok: true }); // don't error for anonymous
            const b = await request.json().catch(() => ({}));
            const event = String(b?.event || "").trim();
            if (CLIENT_EVENTS.has(event)) await trackActivity(buyer.id, event, b?.meta && typeof b.meta === "object" ? b.meta : null);
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.track.failure" });
        }
    });
}
