import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listUsableItems, redeemCharge } from "@/lib/marketplace/inventory.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET ?q= — members holding charged items + each item's charge/cooldown state (for in-store redemption).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/item-charges", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const q = new URL(request.url).searchParams.get("q") || "";
            return noStore({ members: await listUsableItems({ q }) });
        } catch (error) {
            return internalError(error, { event: "admin.item_charges.list.failure" });
        }
    });
}

// POST — redeem one charge. Body: { buyerId, itemId, note }. Decrements a charge + starts the cooldown.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/item-charges", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            const itemId = String(body?.itemId || "").trim();
            if (!buyerId || !itemId) return noStore({ error: "missing_params" }, { status: 400 });
            const res = await redeemCharge(buyerId, itemId, { by: "admin", note: body?.note || null });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.item_charges.redeem.failure" });
        }
    });
}
