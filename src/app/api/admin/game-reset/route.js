import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { RESET_CATALOG, resetSystem, grantUses } from "@/lib/marketplace/game-resets.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the catalog of resettable/grantable systems (for the admin screen to render its options).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/game-reset", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ catalog: RESET_CATALOG });
        } catch (error) {
            return internalError(error, { event: "admin.gamereset.get.failure" });
        }
    });
}

// POST — { action: "reset"|"grant", key, n?, buyerId? }. Omit buyerId to apply to the WHOLE server.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/game-reset", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            const key = String(body?.key || "");
            const buyerId = body?.buyerId ? String(body.buyerId) : null;
            const notify = body?.notify !== false; // default: push the awarded players
            if (!RESET_CATALOG.some((c) => c.key === key)) return noStore({ error: "unknown_key" }, { status: 400 });
            if (action === "reset") return noStore(await resetSystem(key, buyerId, notify));
            if (action === "grant") return noStore(await grantUses(key, body.n, buyerId, notify));
            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "admin.gamereset.action.failure" });
        }
    });
}
