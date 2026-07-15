import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { recordEngagement } from "@/lib/marketplace/engagement.js";
import { createWant } from "@/lib/marketplace/wants.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function coarseGeo(request) {
    const lat = Number(request.headers.get("x-vercel-ip-latitude"));
    const lng = Number(request.headers.get("x-vercel-ip-longitude"));
    return {
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
    };
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/want", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            // Account required: the want (and its notify-me alert) is attached to the signed-in buyer.
            // Works for both the web cookie session and the app's bearer token.
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) {
                return NextResponse.json({ error: "Sign in to save cards and get notified." }, { status: 401 });
            }

            if (!body || !body.catalogProductId) {
                return NextResponse.json({ error: "A product is required." }, { status: 400 });
            }

            try {
                const geo = coarseGeo(request);
                await createWant({
                    catalogProductId: body.catalogProductId,
                    email: buyer.email,
                    maxPrice: body.maxPrice ?? null,
                    quantity: body.quantity ?? 1,
                    note: body.note ?? null,
                    lat: body.lat ?? geo.lat,
                    lng: body.lng ?? geo.lng,
                    buyerId: buyer.id,
                });
                logger.info("marketplace.want.success", { catalogProductId: body.catalogProductId });
                after(() => recordEngagement("want", { catalogProductId: body.catalogProductId }));
                // Loyalty XP for adding to the wishlist (once per product).
                after(() => awardXp(buyer.id, "wishlist_add", { dedupeKey: `wishlist:${buyer.id}:${body.catalogProductId}`, dailyCap: 3, meta: { catalogProductId: body.catalogProductId } }));

                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.want.failure" });
        }
    });
}
