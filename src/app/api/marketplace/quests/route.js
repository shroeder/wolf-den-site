import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { claimQuest, getDailyQuests } from "@/lib/marketplace/quests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET today's daily quests for the signed-in member.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/quests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore(await getDailyQuests(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.quests.list.failure" });
        }
    });
}

// POST { key } — claim a completed quest's reward.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/quests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await claimQuest(buyer.id, String(body?.key || ""));
            if (!res.ok) return noStore(res, { status: 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.quests.claim.failure" });
        }
    });
}
