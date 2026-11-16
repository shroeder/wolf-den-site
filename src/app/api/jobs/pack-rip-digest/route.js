import { NextResponse } from "next/server";

import { packRipDigest } from "@/lib/marketplace/packs.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// ── EVERY 30 MINUTES: ONE PUSH FOR ALL THE PACKS OPENED SINCE THE LAST ONE ──────────────────────────────────
// Luke, 2026-11-16, after eight notifications inside one minute: "Its a bit excessive. Maybe it could alert
// me every once in a while instead. I do want to know whenever people are ripping and how they did. But it
// doesnt have to be immediately. Maybe once every 30 minutes."
//
// ⚠️ THE CADENCE IS NOT THE CONTENT. Every pack is still recorded and still reaches the pack feed; this only
// changes when the PHONE is told. A big hit still pushes at the moment it happens — see notifyPackOpened.
//
// ⚠️ AND IT IS SILENT ON A QUIET WINDOW. packRipDigest sends nothing when no packs were opened, because a
// heartbeat that reports zero every half hour is how a channel teaches you to ignore it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/pack-rip-digest", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("pack_rip_digest.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const result = await packRipDigest();
            logger.info("pack_rip_digest.ran", result);
            return NextResponse.json({ ok: true, ...result });
        } catch (error) {
            return internalError(error, "Pack rip digest failed.");
        }
    });
}
