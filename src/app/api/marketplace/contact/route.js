import { NextResponse } from "next/server";

import { createContactRequest } from "@/lib/marketplace/contact.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/contact", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !body.listingId || !body.buyerEmail) {
                return NextResponse.json(
                    { error: "Listing and a valid email are required." },
                    { status: 400 }
                );
            }

            try {
                const result = await createContactRequest({
                    listingId: body.listingId,
                    buyerName: body.buyerName,
                    buyerEmail: body.buyerEmail,
                    message: body.message,
                });

                logger.info("marketplace.contact.success", { requestId: result.id });

                return NextResponse.json({ ok: true, id: result.id });
            } catch (validationError) {
                // createContactRequest throws user-facing messages for bad input / unavailable listing.
                logger.warn("marketplace.contact.rejected", { reason: validationError.message });

                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.contact.failure" });
        }
    });
}
