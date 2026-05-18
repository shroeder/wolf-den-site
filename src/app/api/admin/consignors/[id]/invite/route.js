import { NextResponse } from "next/server";

import { inviteAdminConsignor } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/invite", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        try {
            const result = await inviteAdminConsignor(id);

            if (result.error) {
                logger.warn("admin.consignors.invite.failed", {
                    consignorId: id,
                    reason: result.error,
                });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.invite.success", {
                consignorId: id,
            });

            return NextResponse.json({ success: true, consignor: result.consignor });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.invite.failure",
                consignorId: id,
            });
        }
    });
}
