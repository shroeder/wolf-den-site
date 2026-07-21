import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getSailingState, startVoyage, beginDig, digAt, upgradeSpeed, upgradeLuck } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Gate every entry point on the owner allow-list — the feature is invisible/unreachable for everyone else.
async function gate() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!isOwner(buyer.id)) return { error: noStore({ error: "not_found" }, { status: 404 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            return noStore(await getSailingState(g.buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sailing", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            switch (body?.action) {
                case "start": return noStore(await startVoyage(g.buyer.id));
                case "begin_dig": return noStore(await beginDig(g.buyer.id));
                case "dig": return noStore(await digAt(g.buyer.id, body.r, body.c));
                case "upgrade_speed": return noStore(await upgradeSpeed(g.buyer.id));
                case "upgrade_luck": return noStore(await upgradeLuck(g.buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.post.failure" });
        }
    });
}
