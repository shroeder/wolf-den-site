import { NextResponse } from "next/server";

import { revokeAdminConsignor } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/revoke", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        try {
            const result = await revokeAdminConsignor(id);

            if (result.error) {
                logger.warn("admin.consignors.revoke.failed", {
                    consignorId: id,
                    reason: result.error,
                });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.revoke.success", { consignorId: id });

            return NextResponse.json({ success: true, consignor: result.consignor });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.revoke.failure",
                consignorId: id,
            });
        }
    });
}
