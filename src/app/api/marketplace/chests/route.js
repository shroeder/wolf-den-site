import { NextResponse } from "next/server";

import { getChests, openChest } from "@/lib/marketplace/chests.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's loot chests by tier (grants any owed by level-ups first).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore({ chests: await getChests(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.get.failure" });
        }
    });
}

// POST — open one chest. Body: { tier }. Returns the reveal (item or gold) + updated chest list.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await openChest(buyer.id, String(body?.tier || ""));
            if (!res.ok) return noStore({ error: res.error }, { status: 400 });
            return noStore({ ...res, chests: await getChests(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.open.failure" });
        }
    });
}
