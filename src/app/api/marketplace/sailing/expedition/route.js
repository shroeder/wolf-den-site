import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";
import {
    comeAlongside, commitBearings, engage, expeditionsOpenTo, getExpeditionState, goAshore,
    leaveIsland, openChart, readSpoils, reachMark, setCourse, setSail, takeNode,
} from "@/lib/marketplace/expedition.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ⚠️ THE SECOND HALF OF THE PAIR. The page will not render for anybody this gate excludes; this stops the
// expedition being played by anybody who found the URL. Both are needed and neither is sufficient — see
// [[feature-gates-come-in-pairs]]. It reads the same CAPTAINS_PUBLIC every other door in the feature reads.
//
// 404 rather than 403, deliberately: a route that says "forbidden" has told you the feature exists.
async function gate() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!expeditionsOpenTo(buyer.id)) return { error: noStore({ error: "not_found" }, { status: 404 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing/expedition", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            return noStore(await getExpeditionState(g.buyer.id) || { error: "failed" });
        } catch (error) {
            return internalError(error, { event: "marketplace.expedition.read.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sailing/expedition", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            switch (String(body?.action || "")) {
                // ── THE SEAMLESS JOURNEY, IN ORDER ───────────────────────────────────────────────────
                // Luke's shape: one unbroken track from the harbour to the beach with no waiting in it. Each
                // action below is one beat of it, and the server holds the phase so a reload lands on the
                // screen you were on rather than the one before it.
                //
                // Push off on one of the day's sailings. Everything — quarry, captain, grade, island — is
                // resolved here and revealed one beat at a time.
                case "set_sail": return noStore(await setSail(g.buyer.id));
                // The sail you have been watching grow is alongside.
                case "engage": return noStore(await engage(g.buyer.id));
                // The beat naming what her captain gave up has been read.
                case "read_spoils": return noStore(await readSpoils(g.buyer.id));
                // Three bearings through the glass. Scored server-side against a face it regenerates.
                case "bearings": return noStore(await commitBearings(g.buyer.id, body.taken));
                // The beat naming where you are going has been read; the boat pushes off.
                case "course": return noStore(await setCourse(g.buyer.id));
                // The run's clock is up and the island fills the screen.
                case "alongside": return noStore(await comeAlongside(g.buyer.id));

                // Spend the best chart in hand and resolve which island it names. ⚠️ KEPT: a member who was
                // handed a chart by the OLD fleet-ladder capture still has a row in mkt_ship_chart, and the
                // seamless journey does not spend those. Removing this would strand every chart already won.
                case "open": return noStore(await openChart(g.buyer.id));
                // The run reached one of its two marks and something is coming alongside.
                case "mark": return noStore(await reachMark(g.buyer.id, body.k));
                // Thirty seconds are up and both marks are behind us.
                case "ashore": return noStore(await goAshore(g.buyer.id));
                // ⚠️ ONE REQUEST PER THING TAKEN, NOT ONE PER FOOTFALL. The browser owns the walk against its
                // own copy of the island (island-world.js) and posts only when something is picked up, with
                // the claim of where it is standing and what that cost. A request per step is the single most
                // expensive shape in this codebase — see CLAUDE.md on round trips being the bill.
                case "take": return noStore(await takeNode(g.buyer.id, { to: body.to, spent: body.spent }));
                // The tide turns, or the player calls it. Idempotent.
                case "leave": return noStore(await leaveIsland(g.buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.expedition.write.failure" });
        }
    });
}
