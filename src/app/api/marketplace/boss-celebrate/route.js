import { NextResponse } from "next/server";

import { getPendingBossCelebration, ackBossCelebration } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Is there an un-celebrated boss defeat for a boss the signed-in member fought?
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/boss-celebrate", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ pending: false });
            return noStore(await getPendingBossCelebration(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.boss_celebrate.get.failure" });
        }
    });
}

// Acknowledge the celebration for a boss so it never replays (on any device).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/boss-celebrate", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ok: false }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            await ackBossCelebration(buyer.id, body?.bossId);
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.boss_celebrate.ack.failure" });
        }
    });
}
