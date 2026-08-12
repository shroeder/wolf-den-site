import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { boutHealth, classMatchups, ladderHealth, recentBouts } from "@/lib/marketplace/arena-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Read-only fight telemetry for the admin panel. Four views, one request, because every balance question so
// far has needed at least two of them side by side — "the Road is too hard" and "the Road is too hard FOR A
// WARDEN" are different findings and only the second one is actionable.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/arena-telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const hours = Number(url.searchParams.get("hours")) || 48;
            const days = Number(url.searchParams.get("days")) || 14;
            const kind = url.searchParams.get("kind") || null;
            const [health, recent, ladder, matchups] = await Promise.all([
                boutHealth({ hours }).catch(() => []),
                recentBouts({ limit: 40, kind }).catch(() => []),
                ladderHealth({ days }).catch(() => []),
                classMatchups({ days }).catch(() => []),
            ]);
            return noStore({ ok: true, hours, days, health, recent, ladder, matchups });
        } catch (error) {
            return internalError(error, { event: "arena.telemetry.failure" });
        }
    });
}
