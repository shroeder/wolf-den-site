import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { cashPosition, setCashInput } from "@/lib/admin-app/free-cash.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only. This exposes the full obligation picture — consignor balances, store credit float, what's in the
// bank — which is the shop's financial position and not a counter job.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/free-cash", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "banking.view", logger);
        if (authError) return authError;
        try {
            return NextResponse.json(await cashPosition());
        } catch (error) {
            return internalError(error);
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/free-cash", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "banking.view", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const res = await setCashInput(body?.key, Number(body?.amount) || 0, body?.by || "owner");
            if (!res.ok) return NextResponse.json(res, { status: 400 });
            return NextResponse.json(await cashPosition());
        } catch (error) {
            return internalError(error);
        }
    });
}
