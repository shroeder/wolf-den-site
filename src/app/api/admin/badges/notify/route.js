import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { notifyMemberBadges } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backfill congrats emails for a member's already-held curated badges (for grants made before the
// congrats email existed). Body: { buyerId } or { alias }. Admin-gated.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/badges/notify", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const body = await request.json().catch(() => ({}));
            let buyerId = String(body?.buyerId || "").trim();
            const alias = String(body?.alias || "").trim().toLowerCase();
            if (!buyerId && alias) {
                const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE alias_normalized = $1`, [alias]).catch(() => null);
                buyerId = row?.id || "";
            }
            if (!buyerId) return NextResponse.json({ error: "buyerId or alias required" }, { status: 400 });

            const sent = await notifyMemberBadges(buyerId);
            return NextResponse.json({ ok: true, sent }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.badges.notify.failure" });
        }
    });
}
