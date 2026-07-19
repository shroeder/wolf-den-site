import { NextResponse } from "next/server";

import { runAvatarSpriteJob } from "@/lib/marketplace/avatar-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a few AI images per run

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// NIGHTLY: draw a batch of new/appearance-changed avatar sprites (2D game-art characters). Cost control —
// runs once a day (see vercel.json), only for members whose avatar APPEARANCE changed (not gear swaps), and
// caps the batch so one run stays under the function's 5-minute limit (~12 images at ~20-25s each).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/avatar-sprites", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("avatar_sprites.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await runAvatarSpriteJob(12);
            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "avatar_sprites.run.failure" });
        }
    });
}
