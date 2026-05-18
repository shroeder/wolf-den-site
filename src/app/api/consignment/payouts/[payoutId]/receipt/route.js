import { NextResponse } from "next/server";

import { getReceiptHtmlForConsignor } from "@/lib/consignment/payouts";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/consignment/payouts/[payoutId]/receipt", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { payoutId } = await params;
            const receiptHtml = await getReceiptHtmlForConsignor(consignor.id, payoutId);

            if (!receiptHtml) {
                return NextResponse.json({ error: "payout_not_found" }, { status: 404 });
            }

            return new NextResponse(receiptHtml, {
                status: 200,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.payouts.receipt.failure",
            });
        }
    });
}
