import { NextResponse } from "next/server";

import { resolveDueEncountersForAll } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// ── SOMETHING SURFACES WHILE YOU ARE AWAY ────────────────────────────────────────────────────────────────────
// Encounters were resolved LAZILY — "on every read of sailing state" — which meant the fight only began at the
// moment you opened the page. The push telling you about it therefore arrived at the same instant as the modal
// it was announcing, so it read as a notification about something already on your screen.
//
// The comment beside that push says an encounter you are not told about is one that stalls your trip until you
// happen to look. That was exactly right and exactly what the lazy resolver made impossible. Every five minutes
// this walks the boats that are actually at sea and opens whatever is due, so the phone buzzes when the kraken
// arrives rather than when you go looking for it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/sail-encounters", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const res = await resolveDueEncountersForAll();
            logger.info("sail.encounters.tick", { step: "resolved", ...res });
            return NextResponse.json({ ok: true, ...res });
        } catch (error) {
            return internalError(error, { event: "sail.encounters.failure" });
        }
    });
}
