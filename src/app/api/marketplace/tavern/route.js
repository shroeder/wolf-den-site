import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { buyRound, claimDailyPint, gambitReroll, gambitResolve, gambitStart, getTavernState } from "@/lib/marketplace/town-tavern.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — tavern state (rumors + dice session + daily pint). Owner-gated during the Town build.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/tavern", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !isOwner(buyer.id)) return noStore({ owner: false });
            return noStore(await getTavernState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.tavern.state.failure" });
        }
    });
}

// POST { action } — dice_start(bet) / dice_roll / dice_cash / pint. Owner-gated during the build.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/tavern", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "not_signed_in" }, { status: 401 });
            if (!isOwner(buyer.id)) return noStore({ error: "forbidden" }, { status: 403 });
            const body = await request.json().catch(() => ({}));
            let res;
            if (body?.action === "gambit_start") res = await gambitStart(buyer.id, body?.bet);
            else if (body?.action === "gambit_reroll") res = await gambitReroll(buyer.id, body?.hold);
            else if (body?.action === "gambit_resolve") res = await gambitResolve(buyer.id);
            else if (body?.action === "pint") res = await claimDailyPint(buyer.id);
            else if (body?.action === "round") res = await buyRound(buyer.id);
            else return noStore({ error: "unknown_action" }, { status: 400 });
            if (!res?.ok) return noStore({ error: res?.error || "failed" }, { status: 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.tavern.action.failure" });
        }
    });
}
