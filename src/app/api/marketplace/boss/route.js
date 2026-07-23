import { NextResponse } from "next/server";

import { getBossState } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { settlePetIncome } from "@/lib/marketplace/pet-income.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Current shared boss state: HP, contributors, and (if signed in) the viewer's attacks-left + damage.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/boss", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (buyer?.id) await settlePetIncome(buyer.id).catch(() => {}); // credit accrued pet income on this daily surface
            const state = await getBossState(buyer?.id || null);
            state.owner = Boolean(buyer && isOwner(buyer.id)); // gates the owner-only "test final blow" button
            return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.boss.state.failure" });
        }
    });
}
