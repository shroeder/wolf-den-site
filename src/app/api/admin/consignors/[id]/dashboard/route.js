import { NextResponse } from "next/server";

import { getAdminConsignorDashboard } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/consignors/[id]/dashboard", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;
        const lookbackDaysParam = new URL(request.url).searchParams.get("lookbackDays");
        const lookbackDays = lookbackDaysParam ? Number(lookbackDaysParam) : undefined;

        if (lookbackDays !== undefined && (!Number.isFinite(lookbackDays) || lookbackDays <= 0)) {
            logger.warn("admin.consignors.dashboard.validation_failure", {
                consignorId: id,
                reason: "invalid_lookback_days",
            });

            return NextResponse.json({ error: "invalid_lookback_days" }, { status: 400 });
        }

        try {
            const result = await getAdminConsignorDashboard(id, {
                lookbackDays,
            });

            if (result.error) {
                logger.warn("admin.consignors.dashboard.failed", {
                    consignorId: id,
                    reason: result.error,
                });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.dashboard.success", {
                consignorId: id,
                lookbackDays: lookbackDays ?? 90,
            });

            return NextResponse.json(result.dashboard, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.dashboard.failure",
                consignorId: id,
            });
        }
    });
}
