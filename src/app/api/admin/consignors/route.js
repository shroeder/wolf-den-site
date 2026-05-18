import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listAdminConsignors } from "@/lib/admin/consignors";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/consignors", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        try {
            const consignors = await listAdminConsignors();

            logger.info("admin.consignors.list.success", {
                count: consignors.length,
            });

            return NextResponse.json(
                {
                    consignors,
                },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.list.failure",
            });
        }
    });
}
