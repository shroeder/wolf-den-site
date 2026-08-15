import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { trophyRoom } from "@/lib/marketplace/trophy-room.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── YOUR TROPHY ROOM, AND ONLY YOURS ─────────────────────────────────────────────────────────────────────────
// This route takes NO owner parameter. The farm route accepts `?u=<alias>` so you can visit a friend's pasture;
// this one always reads the signed-in buyer, so there is no shape of request that returns someone else's room.
// That is the whole gate — a filter on the tab button would be decoration over an open endpoint.
//
// It also lives apart from GET /farm on purpose: assembling the room reads every member's rows across ten
// tables, and that has no business running each time somebody looks at their pigs. The tab fetches it once,
// when it is opened.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/farm/trophies", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const room = await trophyRoom(buyer.id);
            if (!room) return NextResponse.json({ error: "no_room" }, { status: 404 });
            return NextResponse.json(room, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.trophies.failure" });
        }
    });
}
