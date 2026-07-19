import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyConsumable, listConsumables, useConsumable } from "@/lib/marketplace/consumables.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's consumable stash + shop + active boosts.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/consumables", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore(await listConsumables(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.consumables.get.failure" });
        }
    });
}

// POST — { id, action: "buy" | "use" }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/consumables", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const id = String(body?.id || "").trim();
            const target = body?.targetItemId ? String(body.targetItemId).trim() : null;
            const res = body?.action === "use" ? await useConsumable(buyer.id, id, target) : await buyConsumable(buyer.id, id);
            if (!res.ok) return noStore(res, { status: 400 });
            return noStore({ ...res, stash: await listConsumables(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.consumables.post.failure" });
        }
    });
}
