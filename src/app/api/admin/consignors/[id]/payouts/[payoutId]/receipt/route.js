import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getConsignorById } from "@/lib/consignment/config";
import { getReceiptHtmlForConsignor } from "@/lib/consignment/payouts";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/consignors/[id]/payouts/[payoutId]/receipt", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);

        if (authError) {
            return authError;
        }

        const { id, payoutId } = await params;

        try {
            const consignor = await getConsignorById(id);

            if (!consignor) {
                return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
            }

            const receiptHtml = await getReceiptHtmlForConsignor(id, payoutId);

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
                event: "admin.consignors.payouts.receipt.failure",
                consignorId: id,
                payoutId,
            });
        }
    });
}
