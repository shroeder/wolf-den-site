import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { matchProductToCatalog } from "@/lib/marketplace/product-match.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI-matches one Square product (sealed/other with no TCG- SKU) to a TCGplayer catalog product.
// Runs the whole flow server-side (query-gen + catalog search + pick) so tuning ships instantly and
// the admin app just posts { name, price, category } and gets back a suggestion or null.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/marketplace/match-product", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const match = await matchProductToCatalog({
                name: body.name,
                price: body.price ?? null,
                category: body.category ?? null,
            });
            return NextResponse.json({ match: match || null });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.match.failure" });
        }
    });
}
