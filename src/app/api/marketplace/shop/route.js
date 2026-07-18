import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyItem, getInventory } from "@/lib/marketplace/inventory.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — buy an item from the gold shop. Body: { itemId }. Returns the refreshed inventory on success.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/shop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const itemId = String(body?.itemId || "").trim();
            if (!itemId) return noStore({ error: "missing_item" }, { status: 400 });
            const res = await buyItem(buyer.id, itemId);
            if (!res.ok) return noStore({ error: res.error }, { status: 400 });
            after(() => bumpQuestProgress(buyer.id, "buy", 1));
            return noStore({ ok: true, ...(await getInventory(buyer.id)) });
        } catch (error) {
            return internalError(error, { event: "marketplace.shop.buy.failure" });
        }
    });
}
