import { NextResponse } from "next/server";

import { ensureLiveBossArt } from "@/lib/marketplace/boss-admin.js";
import { prepareNextBoss } from "@/lib/marketplace/boss.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // two OpenAI images (portrait + background) can take a while

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Every 10 min: if the live boss is missing its portrait or background (e.g. it was auto-spawned when the
// previous boss died and no admin draft was queued), generate the missing art so members never see the
// fallback silhouette. No-op once the boss has both.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/boss-art", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("boss_art.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            // Two jobs, one wake-up: draw the LIVE boss if it's missing art, and — once that boss is under
            // 5% HP — roll and draw its successor so the next one arrives already illustrated instead of
            // going live blank and waiting an hour for this same cron.
            const [live, next] = await Promise.all([
                ensureLiveBossArt(),
                prepareNextBoss().catch((e) => ({ error: String(e?.message || e) })),
            ]);
            return NextResponse.json({ success: true, ...live, next });
        } catch (error) {
            return internalError(error, { event: "boss_art.run.failure" });
        }
    });
}
