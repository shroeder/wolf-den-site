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
            // The HUD bar tracks progress within the CURRENT level (cumulative XP to reach level L = 50·(L-1)·L),
            // so it visibly moves with every XP gain and reads like a real XP bar — not distance to a far-off
            // reward milestone (which barely budged per hit and looked stuck/wrong). The next-unlock label/icon
            // still ride along as the "what you're working toward" flavor.
            const curBase = 50 * (level - 1) * level; // XP to reach this level
            const nextBase = 50 * level * (level + 1); // XP to reach the next level
            const span = Math.max(1, nextBase - curBase);
            const into = Math.max(0, xp - curBase);
            const pct = Math.max(0, Math.min(100, Math.round((into / span) * 100)));
            const xpToGo = Math.max(0, nextBase - xp); // XP to the next level

            if (!next) return NextResponse.json({ authed: true, maxed: true, xp, gold, level, pct, xpToGo }, { headers: { "Cache-Control": "no-store" } });

            return NextResponse.json(
                { authed: true, xp, gold, level, icon: next.icon, label: next.label, unlockLevel: next.level, xpToGo, pct },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.next_unlock.failure" });
        }
    });
}
