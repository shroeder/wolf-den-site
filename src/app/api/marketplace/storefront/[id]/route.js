import { after, NextResponse } from "next/server";

import { recordEngagement } from "@/lib/marketplace/engagement.js";
import { getVendorStorefront } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public vendor storefront for the phone app: vendor info + trust signals + their active listings.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/storefront/[id]", async ({ internalError }) => {
        try {
            const { id } = await params;
            const storefront = await getVendorStorefront(id);
            if (!storefront) {
                return NextResponse.json({ error: "not_found" }, { status: 404 });
            }
            after(() => recordEngagement("storefront"));
            return NextResponse.json({ storefront }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.storefront.failure" });
        }
    });
}
