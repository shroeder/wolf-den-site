import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { descend, getMiningState, smeltOre, startTrip, surfaceRun, swingAtNode, upgradeMining } from "@/lib/marketplace/mining.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Mining is OWNER-GATED. The gate lives inside mining.js (MINING_UNLOCKED) rather than here, so every entry
// point shares one check and a signed-in non-owner gets a plain { unlocked: false } instead of a 403 that
// would tell them a feature exists.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/mining", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return noStore(await getMiningState(buyer?.id || null));
        } catch (error) {
            return internalError(error, { event: "marketplace.mining.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/mining", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                case "trip": return noStore(await startTrip(buyer.id));
                case "descend": return noStore(await descend(buyer.id));
                case "surface": return noStore(await surfaceRun(buyer.id));
                case "swing": return noStore(await swingAtNode(buyer.id, Number(b.nodeId), b.dist));
                case "smelt": return noStore(await smeltOre(buyer.id, b.tier, b.batches, b.heat));
                case "upgrade": return noStore(await upgradeMining(buyer.id, String(b.track || "")));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.mining.act.failure" });
        }
    });
}
