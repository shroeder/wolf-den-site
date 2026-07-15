import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { acknowledgeLevel, getPendingLevelUp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Is there an un-celebrated level-up for the signed-in user?
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/level-up", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ pending: false });
            return noStore(await getPendingLevelUp(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.levelup.get.failure" });
        }
    });
}

// Acknowledge that the celebration for a level has been shown (so it never replays, on any device).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/level-up", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ ok: false }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            await acknowledgeLevel(buyer.id, body?.level);
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.levelup.ack.failure" });
        }
    });
}
