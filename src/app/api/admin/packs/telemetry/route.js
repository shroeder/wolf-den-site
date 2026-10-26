import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getPackTelemetry } from "@/lib/marketplace/pack-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Virtual pack telemetry (design doc §8.1). `mystery.report` — this carries margin and per-member net
// position, which is a reporting view rather than floor work. The pull queue beside it asks `mystery.manage`.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/packs/telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.report", logger);
        if (authError) return authError;
        try {
            const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
            const data = await getPackTelemetry({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.pack_telemetry.failure" });
        }
    });
}
