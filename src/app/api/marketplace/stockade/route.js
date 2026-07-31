import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { actOnOccupant, getStockadeState } from "@/lib/marketplace/stockade.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who's in the stockade, and how many swings the viewer has left today.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/stockade", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const state = await getStockadeState(buyer?.id || null);
            return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
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
            const res = await actOnOccupant(buyer.id, String(body?.kind || ""));
            if (!res.ok) return NextResponse.json(res, { status: res.error === "out_of_turns" ? 429 : 400 });
            return NextResponse.json({ ...res, ...(await getStockadeState(buyer.id)) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.stockade.act.failure" });
        }
    });
}
