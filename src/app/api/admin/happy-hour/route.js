import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getHappyHourState, startHappyHour, endHappyHour, addToHappyHourPool } from "@/lib/marketplace/happy-hour-core.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — current Happy Hour state (for the admin screen).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/happy-hour", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore(await getHappyHourState(null));
        } catch (error) {
            return internalError(error, { event: "admin.happyhour.get.failure" });
        }
    });
}

// POST — { action: "start", hours, baseMult } | { action: "end" } | { action: "addPool", amount }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/happy-hour", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            if (action === "start") return noStore(await startHappyHour({ hours: body.hours, baseMult: body.baseMult }));
            if (action === "end") return noStore(await endHappyHour());
            if (action === "addPool") return noStore(await addToHappyHourPool(body.amount));
            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "admin.happyhour.action.failure" });
        }
    });
}
