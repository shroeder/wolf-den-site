import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { grantBadge, revokeBadge } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grant or revoke a badge for a member. Body: { buyerId, slug, action: "grant" | "revoke" }.
// Works for curated and unlockable badges alike — the owner has final say. Admin-gated.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/badges/assign", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            const slug = String(body?.slug || "").trim();
            const action = String(body?.action || "grant").trim();
            if (!buyerId || !slug) {
                return NextResponse.json({ error: "buyerId and slug are required" }, { status: 400 });
            }

            const result = action === "revoke" ? await revokeBadge(buyerId, slug) : await grantBadge(buyerId, slug, "admin");
            if (!result.ok) {
                return NextResponse.json({ error: result.error || "failed" }, { status: 400 });
            }
            return NextResponse.json({ ok: true, action: action === "revoke" ? "revoke" : "grant" }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.badges.assign.failure" });
        }
    });
}
