import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { taxPosition } from "@/lib/admin-app/tax-position.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin-app/tax-position[?year=&w2=&fed=&state=]
//
// What the shop will owe, and the aggregates behind it. Composes the Year report (so the two screens can
// never disagree about the same figure) with the FIFO cost batches for ending inventory. No Square call —
// profit comes off the nightly bundle — so this is cheap to open. Opened by hand; nothing polls it.
//
// The w2/fed/state overrides exist so the screen can model "what if I filed single" without a deploy.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/tax-position", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const num = (key) => {
                const raw = searchParams.get(key);
                if (raw == null || raw === "") return undefined;
                const n = Number(raw);
                return Number.isFinite(n) ? n : undefined;
            };
            const yearParam = searchParams.get("year");
            const year = yearParam ? Number(yearParam) : undefined;
            if (yearParam && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
                return NextResponse.json({ error: "year must be a 4-digit year." }, { status: 400 });
            }

            const result = await taxPosition({
                year,
                w2Income: num("w2"),
                federalMarginal: num("fed"),
                stateRate: num("state"),
            });
            logger.info("admin.taxPosition.success", {
                year: result.year,
                setAside: Math.round(result.setAside.amount),
                inventoryAtCost: Math.round(result.inventory.cost),
            });
            return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.taxPosition.failure" });
        }
    });
}
