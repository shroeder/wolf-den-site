import { NextResponse } from "next/server";

import { restoreAdminConsignor } from "@/lib/admin/consignors";
import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/restore", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        try {
            const result = await restoreAdminConsignor(id);

            if (result.error) {
                logger.warn("admin.consignors.restore.failed", {
                    consignorId: id,
                    reason: result.error,
                });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.restore.success", { consignorId: id });

            return NextResponse.json({ success: true, consignor: result.consignor });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.restore.failure",
                consignorId: id,
            });
        }
    });
}
