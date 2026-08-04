import { after, NextResponse } from "next/server";

import { attackBoss, unleashBoss } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Land one hit on the shared boss (daily-limited, awards XP).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/boss/attack", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            // `all` spends every ready strike in one tap. The single-swing path stays for anything that
            // still wants one hit at a time.
            const body = await request.json().catch(() => ({}));
            const result = body?.all ? await unleashBoss(buyer.id) : await attackBoss(buyer.id);
            if (result.error === "unauthorized") return noStore(result, { status: 401 });
            if (result.ok) {
                after(async () => {
                    await bumpQuestProgress(buyer.id, "boss_attack", 1);
                    if (result.crit) await bumpQuestProgress(buyer.id, "crit", 1);
                    if (result.damage) await bumpQuestProgress(buyer.id, "boss_damage", result.damage);
                });
            }
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.boss.attack.failure" });
        }
    });
}
