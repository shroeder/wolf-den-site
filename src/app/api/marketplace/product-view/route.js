import { after, NextResponse } from "next/server";

import { recordProductView } from "@/lib/marketplace/demand.js";
import { recordEngagement } from "@/lib/marketplace/engagement.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Fire-and-forget beacon from a product page: records buyer interest for the Vendor Heat Map + the
// geo/unique-reach engagement log.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/product-view", async () => {
        const body = await request.json().catch(() => ({}));
        if (body?.catalogProductId) {
            await recordProductView(body.catalogProductId).catch(() => {});
            after(() => recordEngagement("view", { catalogProductId: body.catalogProductId }));
        }
        return NextResponse.json({ ok: true });
    });
}
