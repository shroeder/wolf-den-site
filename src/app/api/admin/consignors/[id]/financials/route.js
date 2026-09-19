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
                // ⚠️ THE ITEMS WERE ALWAYS BEING BUILT AND THEN THROWN AWAY. getAdminConsignorDashboard above
                // lists the consignor's whole Square category and counts the stock on every variation — the
                // expensive half of this request — and this response then returned everything EXCEPT that
                // list. The admin app's "Items In Consignment" panel therefore read "No active consignment
                // items were returned" for every consignor, permanently, while the data sat in the object
                // one line up. A consignor with a $240 box still on the shelf looked like he had nothing.
                inventory: dashboardResult.dashboard.inventory,
                // ── THE LINES THAT MAKE UP "CURRENT OWED" ────────────────────────────────────────────
                // One row per item sold since the last payout. A figure somebody is about to hand cash
                // against should be able to show its working — this is what the number is made of, so the
                // screen can itemise it instead of asking anyone to trust a total.
                owedItems: dashboardResult.dashboard.sinceLastPayout || [],
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
