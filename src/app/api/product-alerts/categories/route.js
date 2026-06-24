import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { listVisibleCategories } from "@/lib/product-alerts/categories";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/product-alerts/categories", async ({ internalError }) => {
        try {
            const categories = await listVisibleCategories();

            return NextResponse.json({ categories });
        } catch (error) {
            return internalError(error, { event: "product_alerts.categories.list.failed" });
        }
    });
}
