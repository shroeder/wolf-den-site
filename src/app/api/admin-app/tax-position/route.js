import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { businessPosition } from "@/lib/admin-app/tax-position.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin-app/tax-position[?year=]
//
// The business's own position against the zero line, and the figures behind it. Composes the Year report
// (so the two screens can never disagree about the same dollar) with the FIFO cost batches for the value
// of stock on the shelf. No Square call — profit comes off the nightly bundle — so it is cheap to open.
// Opened by hand; nothing polls it.
//
// It used to take w2/fed/state overrides and project a personal income-tax bill. That is gone: a W-2 and a
// filing status are not facts about the shop, and carrying them here made the shop's own numbers harder to
// read. The path keeps its name so an older build of the app still resolves.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/tax-position", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const yearParam = searchParams.get("year");
            const year = yearParam ? Number(yearParam) : undefined;
            if (yearParam && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
                return NextResponse.json({ error: "year must be a 4-digit year." }, { status: 400 });
            }

            const result = await businessPosition({ year });
            logger.info("admin.businessPosition.success", {
                year: result.year,
                netPosition: Math.round(result.goal.current),
                projected: Math.round(result.goal.projected),
                inventoryAtCost: Math.round(result.inventory.cost),
            });
            return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.businessPosition.failure" });
        }
    });
}
