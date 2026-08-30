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

            const claim = await latestCounterClaim();
            return NextResponse.json({ claim }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "pos.display.failure" });
        }
    });
}
