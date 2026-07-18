import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getPendingGifts, markGiftsSeen } from "@/lib/marketplace/gifts.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — un-shown gifts for the signed-in member (for the pop-up watcher).
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/gifts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ gifts: [] });
            return noStore({ gifts: await getPendingGifts(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.gifts.get.failure" });
        }
    });
}

// POST — mark the given gift ids as shown so they never pop up again. Body: { ids: [..] }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/gifts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ ok: false }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            await markGiftsSeen(buyer.id, body?.ids);
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.gifts.ack.failure" });
        }
    });
}
