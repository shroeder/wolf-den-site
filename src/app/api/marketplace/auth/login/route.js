import { NextResponse } from "next/server";

import { authenticateBuyer, createBuyerSession } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Buyer login from the phone app. Returns a bearer token.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/auth/login", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const buyer = await authenticateBuyer(body.email, body.password);
            if (!buyer) {
                return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
            }
            const { token, expiresAt } = await createBuyerSession(buyer.id, { deviceLabel: "app" });
            logger.info("marketplace.buyer.login", { buyerId: buyer.id });
            return NextResponse.json({ ok: true, token, expiresAt, role: "buyer", buyer });
        } catch (error) {
            return internalError(error, { event: "marketplace.buyer.login.failure" });
        }
    });
}
