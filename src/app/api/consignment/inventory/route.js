import { NextResponse } from "next/server";

import { getConsignorInventory } from "@/lib/consignment/portal-data";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/inventory", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.inventory.unauthorized");

                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            const inventory = await getConsignorInventory(consignor.id);

            logger.info("consignment.inventory.success", {
                consignorId: consignor.id,
                itemCount: inventory.length,
            });

            return NextResponse.json(inventory, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.inventory.failure",
            });
        }
    });
}