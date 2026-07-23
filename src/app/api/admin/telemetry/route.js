import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { telemetryDashboard, recentVisitors, eventDrill, sourceDrill } from "@/lib/marketplace/activity.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?hours=24 — site-wide telemetry: live feed (all users + anonymous) + engagement reports (top
// features, top pages, hourly traffic, totals, device + geo breakdowns). GET ?visitors=1 — the enriched
// per-visitor roster (device / location / IP / referrer) so admins can profile anonymous traffic.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            if (searchParams.get("visitors")) {
                const visitors = await recentVisitors({ limit: Number(searchParams.get("limit")) || 150 });
                return NextResponse.json({ visitors }, { headers: { "Cache-Control": "no-store" } });
            }
            const hours = Number(searchParams.get("hours")) || 168;
            const aud = searchParams.get("audience");
            const audience = aud === "members" || aud === "anon" ? aud : "all";
            // Drill-in: tap a category (event) to see WHO did it, or a traffic source to see who arrived via it.
            const eventKey = searchParams.get("event");
            if (eventKey) {
                const drill = await eventDrill({ event: eventKey, hours, audience });
                return NextResponse.json(drill, { headers: { "Cache-Control": "no-store" } });
            }
            const sourceKind = searchParams.get("sourceKind");
            const sourceLabel = searchParams.get("source");
            if (sourceKind || sourceLabel) {
                const drill = await sourceDrill({ kind: sourceKind || null, source: sourceLabel || null, hours });
                return NextResponse.json(drill, { headers: { "Cache-Control": "no-store" } });
            }
            const data = await telemetryDashboard({ hours, audience });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.telemetry.failure" });
        }
    });
}
