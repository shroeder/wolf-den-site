import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { cancelBounty } from "@/lib/marketplace/bounties.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — creator takes the bounty down; the reserved gold is refunded.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/bounties/[id]/cancel", async ({ internalError }) => {
        try {
            const { id } = await params;
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const res = await cancelBounty(id, buyer.id);
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounty.cancel.failure" });
        }
    });
}
