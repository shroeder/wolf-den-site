import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyRound, claimDailyPint, gambitReroll, gambitResolve, gambitStart, getTavernState, moveTavern } from "@/lib/marketplace/town-tavern.js";
import { sendTownChat } from "@/lib/marketplace/town.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — tavern state (rumors + dice session + daily pint).
//
// The owner gate here was a leftover from the Town's owner-only build phase. Once the Town went public it meant
// every other member got { owner: false }, so the client threw the state away, their gold rendered as 0 and the
// pint/round/ante buttons all sat disabled — reported as "the tavern isn't registering my gold". Any member can
// use the tavern now; only the RAID controls stay owner-only (see the town route).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/tavern", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ owner: false });
            return noStore(await getTavernState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.tavern.state.failure" });
        }
    });
}

// POST { action } — gambit_start(bet) / gambit_reroll / gambit_resolve / pint / round / move / chat.
// Open to any signed-in member; the owner gate was build-phase only (see GET above). Spend limits still apply:
// 50-2000 gold per ante, 5 antes a day, 400 for a round, one free pint a day.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/tavern", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            let res;
            if (body?.action === "gambit_start") res = await gambitStart(buyer.id, body?.bet);
            else if (body?.action === "gambit_reroll") res = await gambitReroll(buyer.id, body?.hold);
            else if (body?.action === "gambit_resolve") res = await gambitResolve(buyer.id);
            else if (body?.action === "pint") res = await claimDailyPint(buyer.id);
            else if (body?.action === "round") res = await buyRound(buyer.id);
            else if (body?.action === "move") res = await moveTavern(buyer.id, { x: body?.x, y: body?.y, facing: body?.facing });
            else if (body?.action === "chat") res = await sendTownChat(buyer.id, body?.body); // shared chat store → shows in the tavern
            else return noStore({ error: "unknown_action" }, { status: 400 });
            if (!res?.ok) return noStore({ error: res?.error || "failed" }, { status: 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.tavern.action.failure" });
        }
    });
}
