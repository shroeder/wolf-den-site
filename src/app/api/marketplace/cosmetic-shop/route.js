import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyCosmetic } from "@/lib/marketplace/store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — buy a cosmetic (pet/border/frame/aura) with gold. Body: { category, ref }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/cosmetic-shop", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const category = String(body?.category || "").trim();
            const ref = String(body?.ref || "").trim();
            if (!category || !ref) return noStore({ error: "missing_params" }, { status: 400 });
            const res = await buyCosmetic(buyer.id, category, ref);
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.cosmetic_shop.failure" });
        }
    });
}
