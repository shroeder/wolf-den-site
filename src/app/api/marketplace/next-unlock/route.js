import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { nextUnlock } from "@/lib/marketplace/unlocks.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cheap "what's my next unlock + how close am I" for the site-wide reward nudge. One query + pure math.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/next-unlock", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ authed: false }, { headers: { "Cache-Control": "no-store" } });

            const row = await db.queryOne(`SELECT xp, COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null);
            const xp = Math.max(0, Math.floor(Number(row?.xp) || 0));
            const gold = Math.max(0, Math.floor(Number(row?.gold) || 0));
            const level = levelForXp(xp).level;
            const next = nextUnlock(level);
            if (!next) return NextResponse.json({ authed: true, maxed: true, xp, gold }, { headers: { "Cache-Control": "no-store" } });

            const target = 50 * (next.level - 1) * next.level; // cumulative XP to REACH next.level
            const xpToGo = Math.max(0, target - xp);
            const pct = target > 0 ? Math.min(100, Math.round((xp / target) * 100)) : 0;

            return NextResponse.json(
                { authed: true, xp, gold, level, icon: next.icon, label: next.label, unlockLevel: next.level, xpToGo, pct },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.next_unlock.failure" });
        }
    });
}
