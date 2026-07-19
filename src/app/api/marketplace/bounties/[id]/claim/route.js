import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { claimBounty, unclaimBounty } from "@/lib/marketplace/bounties.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { action: "claim" | "unclaim" } — take on a bounty, or back out of one.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/bounties/[id]/claim", async ({ internalError }) => {
        try {
            const { id } = await params;
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = b?.action === "unclaim" ? await unclaimBounty(id, buyer.id) : await claimBounty(id, buyer.id);
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounty.claim.failure" });
        }
    });
}
