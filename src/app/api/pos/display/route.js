import { NextResponse } from "next/server";

import { latestCounterClaim, posDisplayKeyOk } from "@/lib/marketplace/pos-display.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── WHAT THE TILL SCREEN ASKS FOR, EVERY FEW SECONDS ─────────────────────────────────────────────────────────
// One row or null. The key is checked before anything is read — a live claim token is a bearer credential and
// this is the one endpoint that hands them out, so see the note in pos-display.js.
//
// ONE CLIENT, ON ONE MACHINE, IN ONE SHOP. That is the whole reason a poll is acceptable here at all: the
// cost rules in CLAUDE.md are about work that multiplies by the number of members, and this multiplies by
// one. It is a single indexed-ish read over a 600-row table, and the display stops asking when the tab is
// hidden (see the client).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/pos/display", async ({ internalError }) => {
        try {
            const key = new URL(request.url).searchParams.get("key");
            // 404 rather than 401: an endpoint that says "wrong key" is an endpoint that confirms it exists
            // and is worth guessing at. Closed also means closed when no key is configured at all.
            if (!posDisplayKeyOk(key)) return NextResponse.json({ error: "not_found" }, { status: 404 });

            // ── THE MYSTERY BOARD RIDES THE SAME POLL ───────────────────────────────────────────────────
            // Luke: "I don't want to have to flip between mystery packs and then this marketing thing."
            // So it is a slide on this screen rather than a second URL somebody has to remember to open.
            //
            // Behind the shared cache at 60s — the poll runs every 4 seconds and this data changes when a
            // bag is sold, so re-reading it fifteen times a minute would be fifteen times the work for the
            // same answer. The claim above is NOT cached: that one has to be live to the second.
            const [claim, mystery] = await Promise.all([
                latestCounterClaim(),
                (async () => {
                    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
                    return shared("pos:mystery", TTL.SLOW * 2, async () => {
                        const { getMysteryBagDashboardData } = await import("@/lib/mystery-bags.js");
                        const d = await getMysteryBagDashboardData().catch(() => null);
                        if (!d) return null;
                        return {
                            remaining: d.remainingPacks ?? null,
                            price: d.bagPrice ?? null,
                            marketTotal: d.metrics?.marketTotal ?? 0,
                            average: d.averagePackValue ?? null,
                            top: (d.topCards || []).slice(0, 3).map((c) => ({
                                name: c.name, value: c.marketValue, image: c.imageUrl || null,
                            })),
                        };
                    });
                })().catch(() => null),
            ]);
            return NextResponse.json({ claim, mystery }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "pos.display.failure" });
        }
    });
}
