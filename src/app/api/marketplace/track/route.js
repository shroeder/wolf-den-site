import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CLIENT_EVENTS, trackActivity, recordVisitor, recordPreciseGeo } from "@/lib/marketplace/activity.js";
import { contextFromHeaders } from "@/lib/marketplace/request-context.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — log a client-side activity event. Body: { event, meta?, path?, anonId?, client? }. Only whitelisted
// client events are accepted. Works for ANONYMOUS visitors too (page_view/traffic) via anonId, and enriches
// each event with device + geo context (edge headers for country/city/IP/UA, client body for screen/lang/tz).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/track", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const b = await request.json().catch(() => ({}));
            const event = String(b?.event || "").trim();
            if (!CLIENT_EVENTS.has(event)) return NextResponse.json({ ok: true });
            const path = b?.path ? String(b.path) : null;
            const anonId = b?.anonId ? String(b.anonId) : null;
            const meta = b?.meta && typeof b.meta === "object" ? b.meta : null;
            // Device/geo/IP/UA from edge headers, plus the client-only signals the server can't see.
            const hdr = contextFromHeaders(request.headers);
            const cl = b?.client && typeof b.client === "object" ? b.client : {};
            const ctx = {
                ...hdr,
                timezone: (cl.tz && String(cl.tz).slice(0, 60)) || hdr.timezone || null,
                lang: cl.lang ? String(cl.lang).slice(0, 20) : null,
                screen: cl.screen ? String(cl.screen).slice(0, 20) : null,
                viewport: cl.viewport ? String(cl.viewport).slice(0, 20) : null,
                referrer: cl.referrer ? String(cl.referrer).slice(0, 300) : null,
                connection: cl.connection ? String(cl.connection).slice(0, 20) : null,
            };
            const attr = b?.attr && typeof b.attr === "object" ? b.attr : null;
            await trackActivity(buyer?.id || null, event, meta, { path, anonId, ctx });
            // Freshen the per-visitor rollup (device/geo + first-touch attribution) off the response path.
            if (anonId) after(() => recordVisitor({ anonId, buyerId: buyer?.id || null, ctx, path, attr }));
            // Opt-in precise geolocation (native permission granted) — store the exact coordinates.
            if (anonId && event === "share_location" && b?.geo && typeof b.geo === "object") {
                after(() => recordPreciseGeo({ anonId, buyerId: buyer?.id || null, lat: b.geo.lat, lng: b.geo.lng, accuracy: b.geo.accuracy }));
            }
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.track.failure" });
        }
    });
}
