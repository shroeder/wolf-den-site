import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CLIENT_EVENTS, trackActivity } from "@/lib/marketplace/activity.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — log a client-side activity event. Body: { event, meta?, path?, anonId? }. Only whitelisted client
// events are accepted. Works for ANONYMOUS visitors too (page_view/traffic) via anonId, so admins see full
// minute-to-minute traffic, not just logged-in members.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/track", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const b = await request.json().catch(() => ({}));
            const event = String(b?.event || "").trim();
            if (!CLIENT_EVENTS.has(event)) return NextResponse.json({ ok: true });
            const path = b?.path ? String(b.path) : null;
            const anonId = b?.anonId ? String(b.anonId) : null;
            await trackActivity(buyer?.id || null, event, b?.meta && typeof b.meta === "object" ? b.meta : null, { path, anonId });
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.track.failure" });
        }
    });
}
