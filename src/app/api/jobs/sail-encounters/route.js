import { NextResponse } from "next/server";

import { resolveDueEncountersForAll, runSailingArrivals, runSailingIdleReminders } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// ── ONE TICK FOR EVERYTHING THAT HAPPENS TO A BOAT WHILE YOU ARE AWAY ────────────────────────────────────────
// Encounters were resolved LAZILY — "on every read of sailing state" — which meant the fight only began at the
// moment you opened the page. The push telling you about it therefore arrived at the same instant as the modal
// it was announcing, so it read as a notification about something already on your screen.
//
// The comment beside that push says an encounter you are not told about is one that stalls your trip until you
// happen to look. That was exactly right and exactly what the lazy resolver made impossible. Every five minutes
// this walks the boats that are actually at sea and opens whatever is due, so the phone buzzes when the kraken
// arrives rather than when you go looking for it.
//
// ── AND ARRIVALS, WHICH USED TO RUN ON ITS OWN HALF-HOURLY CRON ──────────────────────────────────────────────
// GrayKitsune: "I'm not getting notifications properly and idk what I've done. Specifically the ones related to
// sailing." Nothing he had done — his prefs are empty, which is everything ON, and his subscription is live.
// "Land ho" simply ran at :00 and :30, so a boat that landed at :01 said so twenty-nine minutes later, and a
// boat whose owner checked in and started digging before the tick was never told at all (the claim requires
// dig_state IS NULL, correctly — but it means an attentive player receives nothing).
//
// Folding it in here costs NOTHING: two crons at 12/hr and 2/hr become one at 12/hr, so the arrival notice gets
// six times more timely on FEWER invocations than before. The idle reminders come along with it — they gate
// themselves on idle_notified_at, so a faster tick cannot turn a reminder into a nag.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/sail-encounters", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const enc = await resolveDueEncountersForAll();
            // Each is independent: an arrival must still go out if the encounter walk failed, and vice versa.
            const arrivals = await runSailingArrivals().catch(() => ({ checked: 0, pushed: 0, delivered: 0 }));
            const idle = await runSailingIdleReminders().catch(() => ({}));
            logger.info("sail.tick", { step: "resolved", ...enc, arrivals, idle });
            return NextResponse.json({ ok: true, ...enc, arrivals, idle });
        } catch (error) {
            return internalError(error, { event: "sail.encounters.failure" });
        }
    });
}
