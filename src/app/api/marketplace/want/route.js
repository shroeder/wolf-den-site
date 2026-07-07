import { after, NextResponse } from "next/server";

import { resolveBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { recordEngagement } from "@/lib/marketplace/engagement.js";
import { createWant } from "@/lib/marketplace/wants.js";
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

async function buyerFromRequest(request) {
    const auth = request.headers.get("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    if (!token) return null;
    try {
        return await resolveBuyerSession(token);
    } catch {
        return null;
    }
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/want", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            // A signed-in buyer's session supplies their email + account link; otherwise fall back to a
            // posted email (the accountless notify-me path).
            const session = await buyerFromRequest(request);
            const email = session?.buyer?.email || body?.email;

            if (!body || !body.catalogProductId || !email) {
                return NextResponse.json({ error: "Product and a valid email are required." }, { status: 400 });
            }

            try {
                const geo = coarseGeo(request);
                await createWant({
                    catalogProductId: body.catalogProductId,
                    email,
                    maxPrice: body.maxPrice ?? null,
                    quantity: body.quantity ?? 1,
                    note: body.note ?? null,
                    lat: body.lat ?? geo.lat,
                    lng: body.lng ?? geo.lng,
                    buyerId: session?.buyer?.id ?? null,
                });
                logger.info("marketplace.want.success", { catalogProductId: body.catalogProductId });
                after(() => recordEngagement("want", { catalogProductId: body.catalogProductId }));

                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.want.failure" });
        }
    });
}
