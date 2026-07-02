import { NextResponse } from "next/server";

import { recordProductView } from "@/lib/marketplace/demand.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Fire-and-forget beacon from a product page: records buyer interest for the Vendor Heat Map.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/product-view", async () => {
        const body = await request.json().catch(() => ({}));
        if (body?.catalogProductId) {
            await recordProductView(body.catalogProductId).catch(() => {});
        }
        return NextResponse.json({ ok: true });
    });
}
