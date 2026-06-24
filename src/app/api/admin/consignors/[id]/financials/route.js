import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getAdminConsignorDashboard } from "@/lib/admin/consignors";
import { getConsignorById } from "@/lib/consignment/config";
import { getTotalPaidForConsignor, listPayoutsForConsignor } from "@/lib/consignment/payouts";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/consignors/[id]/financials", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        try {
            const consignor = await getConsignorById(id);

            if (!consignor) {
                return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
            }

            const dashboardResult = await getAdminConsignorDashboard(id);

            if (dashboardResult.error) {
                return NextResponse.json({ error: dashboardResult.error }, { status: dashboardResult.status || 400 });
            }

            const [payouts, totalPaid] = await Promise.all([
                listPayoutsForConsignor(id),
                getTotalPaidForConsignor(id),
            ]);

            return NextResponse.json({
                consignor: {
                    id: consignor.id,
                    slug: consignor.slug,
                    displayName: consignor.display_name,
                    email: consignor.email,
                    payoutRate: Number(consignor.payout_rate || 0),
                    active: Boolean(consignor.active),
                },
                summary: dashboardResult.dashboard.summary,
                payouts,
                totalPaid,
                receiptUrlTemplate: `/api/admin/consignors/${consignor.id}/payouts/{payoutId}/receipt`,
            }, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.financials.failure",
                consignorId: id,
            });
        }
    });
}
