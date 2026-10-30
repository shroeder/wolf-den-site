import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { resolveHandoffClaim } from "@/lib/marketplace/handoff.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff scanned a member's counter code. Says who it is and which screen to open; takes no action and
// spends nothing. Every verb behind the screen it routes to is separately authenticated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/handoff", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const res = await resolveHandoffClaim(searchParams.get("token"), {
                by: searchParams.get("by") || "staff",
            });
            if (!res.ok) {
                // 404 for an unknown token, 410 for one that timed out -- the app says different things.
                return NextResponse.json(res, { status: res.error === "expired" ? 410 : 404 });
            }
            logger.info("admin.handoff.resolved", { kind: res.kind, buyerId: res.buyerId });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.handoff.resolve.failure" });
        }
    });
}
