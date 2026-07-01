import { NextResponse } from "next/server";

import { createSellOffer, isValidEmail } from "@/lib/marketplace/sell-offers.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public: a seller posts cards for local vendors to make offers on.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/sell-offer", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !isValidEmail(body.email)) {
                return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
            }
            if (!body.items || !String(body.items).trim()) {
                return NextResponse.json({ error: "Tell vendors what you'd like to sell." }, { status: 400 });
            }

            try {
                const result = await createSellOffer({
                    name: body.name,
                    email: body.email,
                    phone: body.phone,
                    items: body.items,
                    askingPrice: body.askingPrice,
                });
                logger.info("sell_offer.created", { offerId: result.id });
                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "sell_offer.create.failure" });
        }
    });
}
