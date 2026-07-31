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

// FREQUENT (every 15 min — see vercel.json): draw a bounded batch of pending avatar sprites (2D game-art
// characters) — members who are new, changed their avatar's APPEARANCE, or changed their equipped GEAR since
// the sprite was last drawn (so the loadout stays current). Cost is capped by a per-member 24h cooldown: each
// member is redrawn at most once/day no matter how often they fiddle, so the daily image ceiling ≈ the
// roster size. The frequent schedule is for RESILIENCE, not extra draws: a backlog drains across ticks, a
// failed tick retries next tick, and poison items back off after a few attempts (tracked per member).
// Steady state (nothing eligible) is a cheap no-op — just a COUNT query, no image generation.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/avatar-sprites", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("avatar_sprites.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await runAvatarSpriteJob();
            // The AI facing read-pass used to run here every 15 minutes, unattended: up to 12 sprites a tick,
            // three gpt-4o vision calls each at detail:"high". It was ~$1.20/month to answer left-or-right,
            // and auditing its own output showed it labelling symmetrical creatures (a butterfly, a jellyfish)
            // as facing one way and getting clearly directional ones backwards. Sprites are already nudged
            // right-facing at generation time, which is the cheap pass and the one that works.
            return NextResponse.json({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "avatar_sprites.run.failure" });
        }
    });
}
