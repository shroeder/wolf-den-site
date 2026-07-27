import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getBadgeMilestones, claimBadgeMilestone } from "@/lib/marketplace/badges.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's collection-milestone board.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/badge-milestones", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            return noStore(await getBadgeMilestones(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.badge_milestones.get.failure" });
        }
    });
}

// POST { count } — claim one reached milestone (gold + chest).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/badge-milestones", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = await claimBadgeMilestone(buyer.id, Number(b?.count));
            return noStore(res, { status: res?.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.badge_milestones.claim.failure" });
        }
    });
}
