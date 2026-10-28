import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { actBoard, claimActQuest } from "@/lib/marketplace/act-board.js";
import { withRequestLogging } from "@/lib/server-logger";

// ── THE ACT BOARD'S DOOR ─────────────────────────────────────────────────────────────────────────────────────
// GET  ?town=deepdelve   the ladder for that act, with progress counted live
// POST { quest }          claim a finished rung
//
// ⚠️ ITS OWN ROUTE, NOT A FIELD ON THE TOWN STATE. getTownState is the highest-volume request in the app and
// renders the whole plaza; folding two more queries into it would bill the act board on every town load for
// every member whether or not they ever tap it. This is read when the board is OPENED, which is rare.

export const dynamic = "force-dynamic";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/acts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return NextResponse.json({ board: null }, { headers: { "Cache-Control": "no-store" } });
            const town = new URL(request.url).searchParams.get("town");
            return NextResponse.json({ board: await actBoard(buyer.id, town) }, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
            return internalError(e);
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/acts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await claimActQuest(buyer.id, String(body?.quest || ""));
            // The board is re-read from the server rather than patched on the client, so what the player sees
            // after a claim is what the database says — including the next rung opening.
            const board = res.ok ? await actBoard(buyer.id, String(body?.town || "")) : null;
            return NextResponse.json({ ...res, board }, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
            return internalError(e);
        }
    });
}
