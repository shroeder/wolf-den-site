import { NextResponse } from "next/server";

import { getConsignorSales } from "@/lib/consignment/portal-data";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/sales", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.sales.unauthorized");

                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            const sales = await getConsignorSales(consignor.id);

            logger.info("consignment.sales.success", {
                consignorId: consignor.id,
                itemCount: sales.length,
            });

            return NextResponse.json(sales, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.sales.failure",
            });
        }
    });
}