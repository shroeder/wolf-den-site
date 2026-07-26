import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCreationsAdmin } from "@/lib/marketplace/creations-admin.js";
import { grantCustomCredit } from "@/lib/marketplace/custom-deco.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creations console for the admin app: purchases (who bought which bundle), usage (who made what custom art),
// and outstanding balances. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/creations", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const data = await getCreationsAdmin();
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.creations.failure" });
        }
    });
}

// Comp a member creations from the admin app (e.g. after a paid draw failed/was refused, or as a goodwill grant).
// POST { action:"grant", buyerId, count } → adds `count` creation tokens to that member's balance.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/creations", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            if (body?.action !== "grant") return NextResponse.json({ error: "bad_action" }, { status: 400 });
            const buyerId = String(body?.buyerId || "").trim();
            const count = Math.max(1, Math.min(50, Math.round(Number(body?.count) || 0)));
            if (!buyerId || !count) return NextResponse.json({ error: "bad_request" }, { status: 400 });
            const res = await grantCustomCredit(buyerId, count);
            if (!res?.ok) return NextResponse.json({ error: "grant_failed" }, { status: 400 });
            logger?.info?.("admin.creations.grant", { buyerId, count, balance: res.credits });
            return NextResponse.json({ ok: true, credits: res.credits, granted: count }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.creations.grant.failure" });
        }
    });
}
