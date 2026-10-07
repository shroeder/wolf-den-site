import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    groveState, groveEnter, groveSettle, groveMove, groveCraft, groveEquipEmblem, groveBelt, groveBoss,
} from "@/lib/marketplace/grove.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init) => {
    const res = NextResponse.json(body, init);
    res.headers.set("Cache-Control", "no-store");
    return res;
};

// ── THE GROVE'S ONE DOOR ─────────────────────────────────────────────────────────────────────────────────────
// Five verbs, and that is deliberately ALL of them.
//
// ⚠️ THERE IS NO "I MOVED", NO "I SWUNG", NO "I WAS HIT". The scene runs entirely in the browser (see
// grove-roll.js for why) because a kill loop that talked to the server per event would be the most expensive
// feature in the game — round trips are Active CPU, which is the meter that bills. This endpoint is spoken to
// when you enter a zone, when you settle a burst of kills, and when a boss dies, and at no other time.
//
// The boss is the one kill that gets its own request, and it is worth the spend: at most one every thirty
// minutes per zone, in exchange for a cooldown and a clear-the-zone check that a batched claim could not be
// held to. See groveBoss.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/grove", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer(request);
            if (!buyer?.id) return noStore({ ok: false, error: "signed_out" }, { status: 401 });
            return noStore(await groveState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "grove.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/grove", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer(request);
            if (!buyer?.id) return noStore({ ok: false, error: "signed_out" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (b?.action) {
                case "enter": return noStore(await groveEnter(buyer.id, String(b.zone || "")));
                case "settle": return noStore(await groveSettle(buyer.id, { zoneId: String(b.zone || ""), kills: b.kills, eaten: b.eaten }));
                case "boss": return noStore(await groveBoss(buyer.id, String(b.zone || "")));
                case "move": return noStore(await groveMove(buyer.id, b));
                case "craft": return noStore(await groveCraft(buyer.id, String(b.recipe || "")));
                case "emblem": return noStore(await groveEquipEmblem(buyer.id, b));
                case "belt": return noStore(await groveBelt(buyer.id, b.food ? String(b.food) : null));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "grove.action.failure" });
        }
    });
}
