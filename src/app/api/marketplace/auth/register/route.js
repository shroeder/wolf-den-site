import { NextResponse } from "next/server";

import { createBuyer, createBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Buyer self-registration from the phone app. Returns a bearer token.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/register", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            try {
                const buyer = await createBuyer({
                    email: body.email,
                    password: body.password,
                    displayName: body.displayName ?? null,
                });
                const { token, expiresAt } = await createBuyerSession(buyer.id, { deviceLabel: "app" });
                logger.info("marketplace.buyer.registered", { buyerId: buyer.id });
                return NextResponse.json({ ok: true, token, expiresAt, role: "buyer", buyer });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.buyer.register.failure" });
        }
    });
}
