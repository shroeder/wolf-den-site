import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { equipAvatarCosmetic } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Equip (or clear) an avatar cosmetic in a slot. Body: { slot: "aura|headwear|effect|pet", id: "<id>"|null }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/avatar-cosmetic", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const slot = String(body?.slot || "");
            const id = body?.id ? String(body.id) : null;
            const profile = await equipAvatarCosmetic(buyer.id, slot, id);
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.avatar_cosmetic.failure" });
        }
    });
}
