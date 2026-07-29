import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuctionState, getAuctionListings, listAuctionItem, buyAuctionListing, cancelAuctionListing } from "@/lib/marketplace/auction.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the Auction House state (browse listings + your sellable items + your listings). Owner-gated.
// Optional query (?q=&slot=&rarity=&sort=) filters just the browse list for live search.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/auction", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ owner: false });
            const { searchParams } = new URL(request.url);
            if (searchParams.has("q") || searchParams.has("slot") || searchParams.has("rarity") || searchParams.has("sort")) {
                const listings = await getAuctionListings(buyer.id, {
                    q: searchParams.get("q") || "", slot: searchParams.get("slot") || "",
                    rarity: searchParams.get("rarity") || "", sort: searchParams.get("sort") || "new",
                });
                return noStore({ owner: true, listings });
            }
            return noStore(await getAuctionState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.auction.state.failure" });
        }
    });
}

// POST { action } — list / buy / cancel. Owner-gated.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auction", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            let res;
            if (body?.action === "list") res = await listAuctionItem(buyer.id, body?.itemId, body?.price, body?.days);
            else if (body?.action === "buy") res = await buyAuctionListing(buyer.id, body?.id);
            else if (body?.action === "cancel") res = await cancelAuctionListing(buyer.id, body?.id);
            else return noStore({ error: "unknown_action" }, { status: 400 });
            if (!res?.ok) return noStore({ error: res?.error || "failed" }, { status: res?.error === "forbidden" ? 403 : 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.auction.action.failure" });
        }
    });
}
