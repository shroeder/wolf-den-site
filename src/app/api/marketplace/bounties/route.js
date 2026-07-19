import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { createBounty, listBounties } from "@/lib/marketplace/bounties.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the bounty board. Query: ?status=open|all&type=...&mine=1. POST — create a bounty (reserves gold).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/bounties", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const { searchParams } = new URL(request.url);
            const bounties = await listBounties({
                status: searchParams.get("status") || "open",
                type: searchParams.get("type") || null,
                mine: searchParams.get("mine") === "1",
                buyerId: buyer?.id || null,
            });
            // getAuthenticatedBuyer() doesn't carry gold — read the live balance.
            let gold = null;
            if (buyer) {
                const g = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null);
                gold = g?.gold ?? 0;
            }
            return NextResponse.json({ bounties, gold }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounties.list.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/bounties", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = await createBounty({
                creatorId: buyer.id,
                type: b?.type,
                title: b?.title,
                description: b?.description ?? null,
                images: Array.isArray(b?.images) ? b.images : [],
                rewardGold: b?.rewardGold,
                mode: b?.mode,
            });
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.bounties.create.failure" });
        }
    });
}
