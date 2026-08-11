import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { actOnOccupant, getStockadeState, unlockStockade } from "@/lib/marketplace/stockade.js";
import { getElection, nominate, castVote } from "@/lib/marketplace/stockade-election.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who's in the stockade, and how many swings the viewer has left today.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/stockade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const state = await getStockadeState(buyer?.id || null);
            // The election rides on the same read the town already makes. It is also what ADVANCES the cycle —
            // closing a finished poll, passing sentence, releasing someone whose three days are up — so the
            // feature has no cron: it moves whenever somebody looks at the town, which is the only time it
            // needs to have moved.
            const election = await getElection(buyer?.id || null).catch(() => null);
            return NextResponse.json({ ...state, election }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.stockade.state.failure" });
        }
    });
}

// Shame the occupant or throw fruit. The daily cap is enforced in the DB, not here.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/stockade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const kind = String(body?.kind || "");
            // Nominating and voting come through the same door as shaming, because they are the same screen.
            if (kind === "nominate") {
                const r = await nominate(buyer.id, String(body?.target || ""), body?.crime || null);
                return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
            }
            if (kind === "vote") {
                const r = await castVote(buyer.id, String(body?.target || ""));
                return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
            }
            // The Warden's Key. unlockStockade is the gate — it claims the week's single use and refuses
            // anyone not wearing the piece, so this route never has to know which item grants what.
            if (kind === "unlock") {
                const r = await unlockStockade(buyer.id);
                return NextResponse.json({ ...r, ...(await getStockadeState(buyer.id)) }, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
            }
            const res = await actOnOccupant(buyer.id, kind);
            if (!res.ok) return NextResponse.json(res, { status: res.error === "out_of_turns" ? 429 : 400 });
            return NextResponse.json({ ...res, ...(await getStockadeState(buyer.id)) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.stockade.act.failure" });
        }
    });
}
