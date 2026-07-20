import { NextResponse } from "next/server";

import { runAvatarSpriteJob, detectBuyerSpriteFacings } from "@/lib/marketplace/avatar-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a few AI images per run

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// NIGHTLY: redraw every pending avatar sprite (2D game-art characters) — members who are new, changed their
// avatar's APPEARANCE, or changed their equipped GEAR since the sprite was last drawn (so the loadout stays
// current). Runs once a day (see vercel.json); no fixed count cap, but a soft time budget keeps a single run
// under the function's 5-minute limit and any leftovers resume the next night.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/avatar-sprites", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("avatar_sprites.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await runAvatarSpriteJob();
            // AI facing read-pass: mark left-facing sprites so they render mirrored (right-facing).
            const facing = await detectBuyerSpriteFacings(12).catch(() => null);
            return NextResponse.json({ success: true, ...result, facing });
        } catch (error) {
            return internalError(error, { event: "avatar_sprites.run.failure" });
        }
    });
}
