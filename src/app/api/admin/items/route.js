import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { ITEMS, describeStats } from "@/lib/marketplace/items.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the item catalog (for the admin grant picker). Serialized without the icon component.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const items = ITEMS.map((i) => ({
                id: i.id, name: i.name, slot: i.slot, rarity: i.rarity, reqLevel: i.reqLevel,
                stats: describeStats(i.stats), charged: Boolean(i.charged), chargeRewardLabel: i.chargeRewardLabel || null, source: i.source,
            }));
            return noStore({ items });
        } catch (error) {
            return internalError(error, { event: "admin.items.list.failure" });
        }
    });
}

// POST — grant an item to a member. Body: { buyerId, itemId }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            const itemId = String(body?.itemId || "").trim();
            if (!buyerId || !itemId) return noStore({ error: "missing_params" }, { status: 400 });
            const res = await grantItem(buyerId, itemId, "admin");
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.items.grant.failure" });
        }
    });
}
