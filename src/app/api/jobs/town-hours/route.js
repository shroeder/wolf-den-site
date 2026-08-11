import { NextResponse } from "next/server";

import { runTownHoursTick, maybeSpawnRandomEvent, resolveExpiredEvents } from "@/lib/marketplace/town-events.js";
import { maybeSpawnShiny } from "@/lib/marketplace/town-shiny.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Every ~15 min: when the shop has just opened, auto-spawn a Town event + push everyone. No-op unless
// TOWN_EVENTS_LIVE is set (owner-gated build) and the store just opened.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/town-hours", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("town_hours.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            // ── CLOSE OUT ANYTHING THAT HAS FINISHED, FIRST ──────────────────────────────────────────────
            // A skirmish raid never ends on a clear — it runs to its timer — and resolving it used to happen
            // only when somebody loaded the Town. So a raid that ran out overnight paid nobody and never sent
            // its "raid over" push, and it also held the one-active-event slot, which blocks the spawn below.
            // Runs before the spawn attempts for exactly that reason.
            const closed = await resolveExpiredEvents().catch((e) => ({ error: String(e?.message || e) }));
            // Store-open spawn first; if that didn't fire, roll the evening-weighted random spawn.
            const hours = await runTownHoursTick();
            const random = hours.spawned ? { skipped: "store_open_spawned" } : await maybeSpawnRandomEvent();
            const shiny = await maybeSpawnShiny().catch((e) => ({ error: String(e?.message || e) }));
            // Boss passive damage is NOT ticked here — it accrues from each present member's own town poll
            // (accrueSquarePassive), because a 15-minute cron is far too coarse for a 5-10 minute fight.
            return NextResponse.json({ success: true, closed, hours, random, shiny });
        } catch (error) {
            return internalError(error, { event: "town_hours.run.failure" });
        }
    });
}
