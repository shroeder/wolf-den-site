import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { equipItem, getInventory, syncLevelItems, unequipItem } from "@/lib/marketplace/inventory.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's inventory + equipped loadout + total stats. Grants any newly-qualified level items.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/inventory", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            await syncLevelItems(buyer.id).catch(() => {});
            return noStore(await getInventory(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.inventory.get.failure" });
        }
    });
}

// POST — equip or unequip. Body: { slot, itemId } to equip; { slot, itemId: null } to clear the slot.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/inventory", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const slot = String(body?.slot || "").trim();
            if (!slot) return noStore({ error: "missing_slot" }, { status: 400 });
            const inv = body?.itemId ? await equipItem(buyer.id, slot, String(body.itemId)) : await unequipItem(buyer.id, slot);
            return noStore(inv);
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.inventory.equip.failure" });
        }
    });
}
