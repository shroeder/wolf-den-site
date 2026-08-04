import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { clearDelveRun, delveAct, getDelveState, startDelve, upgradeDelve } from "@/lib/marketplace/delves.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Delves are OWNER-GATED. The gate lives in delves.js (DELVES_UNLOCKED) rather than here, so every entry point
// shares one check and a signed-in non-owner gets a plain { unlocked: false } instead of a 403 that would tell
// them the feature exists at all.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/delves", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return noStore(await getDelveState(buyer?.id || null));
        } catch (error) {
            return internalError(error, { event: "marketplace.delves.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/delves", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            switch (action) {
                case "start": return noStore(await startDelve(buyer.id, String(body?.dungeon || "")));
                // Every in-run verb funnels through delveAct so the run is read, mutated and saved in one place.
                case "enter":
                case "strike":
                case "potion":
                case "choose":
                // "onward" replaced "flee": a floor now stops on its result and you tap to leave it. There is
                // no retreat verb any more — it ended the run for exactly what dying pays.
                case "onward": return noStore(await delveAct(buyer.id, action, body?.choice ?? null));
                case "upgrade": return noStore(await upgradeDelve(buyer.id, String(body?.track || "")));
                case "dismiss": return noStore(await clearDelveRun(buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.delves.act.failure" });
        }
    });
}
