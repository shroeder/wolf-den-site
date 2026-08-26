import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCasinoReport } from "@/lib/marketplace/casino-report.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the casino floor is actually doing: chips staked against chips paid, per game and per cabinet, plus
// which bonuses fire, who plays, what leaves through the Counter and every win worth ten times its bet. See
// casino-report.js — and note that returns are withheld below a sample floor rather than printed as noise.
// GET ?days=1|7|30. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/casino", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Number(new URL(request.url).searchParams.get("days")) || 7;
            const data = await getCasinoReport({ days });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.casino.failure" });
        }
    });
}
