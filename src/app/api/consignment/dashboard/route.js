import { NextResponse } from "next/server";

import { getConsignorDashboard } from "@/lib/consignment/portal-data";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/dashboard", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.dashboard.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const dashboard = await getConsignorDashboard(consignor.id);

            logger.info("consignment.dashboard.success", {
                consignorId: consignor.id,
            });

            return NextResponse.json(dashboard, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.dashboard.failure",
            });
        }
    });
}
