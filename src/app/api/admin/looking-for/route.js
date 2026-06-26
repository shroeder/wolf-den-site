import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listLookingForDemand } from "@/lib/looking-for/demand";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/looking-for", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);

        if (authError) {
            return authError;
        }

        try {
            const demand = await listLookingForDemand();

            logger.info("admin.looking_for.list.success", {
                watchers: demand.totals.watchers,
                items: demand.totals.items,
                inStockItems: demand.totals.inStockItems,
            });

            return NextResponse.json(demand, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.looking_for.list.failure",
            });
        }
    });
}
