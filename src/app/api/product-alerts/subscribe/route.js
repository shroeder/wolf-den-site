import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";
import { upsertAccountSubscriber } from "@/lib/product-alerts/subscribers";

export const runtime = "nodejs";

// Follow new-arrival categories. Requires a marketplace account; alerts go to the account's verified
// email + push (no confirmation step). Signed-out visitors are prompted to create a free account.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/product-alerts/subscribe", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) {
                return NextResponse.json({ error: "Sign in to turn on new-arrival alerts." }, { status: 401 });
            }

            const body = await request.json().catch(() => null);
            const categoryIds = Array.isArray(body?.categoryIds) ? body.categoryIds : [];

            if (!categoryIds.length) {
                return NextResponse.json({ error: "Pick at least one category to follow." }, { status: 400 });
            }

            const result = await upsertAccountSubscriber(buyer, categoryIds);

            if (result.error === "no_categories") {
                return NextResponse.json({ error: "Pick at least one valid category to follow." }, { status: 400 });
            }

            return NextResponse.json({
                success: true,
                email: buyer.email,
                message: "Alerts are on. We'll email and notify you when new stock lands in your categories.",
            });
        } catch (error) {
            return internalError(error, { event: "product_alerts.subscribe.failed" });
        }
    });
}
