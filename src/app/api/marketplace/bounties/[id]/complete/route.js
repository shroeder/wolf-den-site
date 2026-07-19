import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { completeBounty } from "@/lib/marketplace/bounties.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { winnerIds: [...] } — creator marks the bounty complete and pays the selected helper(s).
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/bounties/[id]/complete", async ({ internalError }) => {
        try {
            const { id } = await params;
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = await completeBounty(id, buyer.id, Array.isArray(b?.winnerIds) ? b.winnerIds : []);
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounty.complete.failure" });
        }
    });
}
