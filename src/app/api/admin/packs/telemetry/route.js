import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getPackTelemetry } from "@/lib/marketplace/pack-telemetry.js";
import { poolAlphaHistory } from "@/lib/marketplace/pack-pools.js";
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
            // ── THE CURVE'S HISTORY RIDES ALONG ───────────────────────────────────────────────────
            // Telemetry already answers "what did the packs DO"; this answers "what were they tuned to
            // while they did it", which is the half that used to be unanswerable because pool state is
            // overwritten nightly. Same window, same permission, one extra read on a report that is
            // already several — rather than a second endpoint nobody would remember to call.
            const [data, alphaHistory] = await Promise.all([
                getPackTelemetry({ days }),
                poolAlphaHistory({ days }).catch(() => []),
            ]);
            return NextResponse.json({ ...data, alphaHistory }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.pack_telemetry.failure" });
        }
    });
}
