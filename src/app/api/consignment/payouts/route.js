import { NextResponse } from "next/server";

import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { getTotalPaidForConsignor, listPayoutsForConsignor } from "@/lib/consignment/payouts";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/payouts", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const [payouts, totalPaid] = await Promise.all([
                listPayoutsForConsignor(consignor.id),
                getTotalPaidForConsignor(consignor.id),
            ]);

            return NextResponse.json({
                payouts,
                totalPaid,
            }, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.payouts.list.failure",
            });
        }
    });
}
