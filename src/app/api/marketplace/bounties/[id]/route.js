import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getBountyDetail } from "@/lib/marketplace/bounties.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — full detail for one bounty, including who has taken it on.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/bounties/[id]", async ({ internalError }) => {
        try {
            const { id } = await params;
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const bounty = await getBountyDetail(id, buyer?.id || null);
            if (!bounty) return NextResponse.json({ error: "not_found" }, { status: 404 });
            return NextResponse.json({ bounty, gold: buyer?.gold ?? null }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounty.detail.failure" });
        }
    });
}
