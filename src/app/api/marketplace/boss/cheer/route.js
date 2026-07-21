import { after, NextResponse } from "next/server";

import { cheer } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Cheer the hero currently on stage — bonus damage for them, XP + coin (+ gear procs) for you. Daily-limited.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/boss/cheer", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const result = await cheer(buyer.id, body?.targetId);
            if (result.error === "unauthorized") return noStore(result, { status: 401 });
            if (result.ok) after(async () => { await bumpQuestProgress(buyer.id, "cheer", 1); });
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.boss.cheer.failure" });
        }
    });
}
