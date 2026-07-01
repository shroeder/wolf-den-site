import { NextResponse } from "next/server";

import { createSellInquiry, isValidEmail } from "@/lib/sell-inquiries.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public "sell or consign to us" submission.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/sell-inquiry", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !isValidEmail(body.email)) {
                return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
            }
            if (!body.items || !String(body.items).trim()) {
                return NextResponse.json({ error: "Tell us what you'd like to sell or consign." }, { status: 400 });
            }

            try {
                const result = await createSellInquiry({
                    kind: body.kind,
                    name: body.name,
                    email: body.email,
                    phone: body.phone,
                    items: body.items,
                    message: body.message,
                });
                logger.info("sell_inquiry.created", { inquiryId: result.id });
                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "sell_inquiry.create.failure" });
        }
    });
}
