import { NextResponse } from "next/server";

import { listUpcomingEvents } from "@/lib/marketplace/events.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: upcoming events. Filters: ?q= (name / location / attending vendor), ?date=YYYY-MM-DD,
// and vicinity — ?near=auto uses the caller's Vercel edge geo, or pass ?lat=&lng= explicitly.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/events", async ({ internalError }) => {
        try {
            const sp = new URL(request.url).searchParams;
            let nearLat = null;
            let nearLng = null;
            if (sp.get("lat") && sp.get("lng")) {
                nearLat = Number(sp.get("lat"));
                nearLng = Number(sp.get("lng"));
            } else if (sp.get("near") === "auto" && sp.get("src") !== "app") {
                // Web-only edge-geo fallback; the app (src=app) supplies real GPS or gets no vicinity
                // filter — carrier-IP geo on cellular is hundreds of miles off.
                nearLat = Number(request.headers.get("x-vercel-ip-latitude")) || null;
                nearLng = Number(request.headers.get("x-vercel-ip-longitude")) || null;
            }
            const events = await listUpcomingEvents({
                q: sp.get("q") || null,
                date: sp.get("date") || null,
                nearLat,
                nearLng,
            });
            return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.events.list.failure" });
        }
    });
}
