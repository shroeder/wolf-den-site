import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { unsubscribeByToken } from "@/lib/product-alerts/subscribers";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/product-alerts/unsubscribe", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const token = searchParams.get("token") || "";

            const removed = await unsubscribeByToken(token);
            const redirectTo = new URL("/alerts", process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);

            redirectTo.searchParams.set("unsubscribed", removed ? "1" : "invalid");

            return NextResponse.redirect(redirectTo);
        } catch (error) {
            return internalError(error, { event: "product_alerts.unsubscribe.failed" });
        }
    });
}
