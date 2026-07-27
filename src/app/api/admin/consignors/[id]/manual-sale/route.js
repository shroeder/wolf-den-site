import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getConsignorById } from "@/lib/consignment/config";
import { recordManualConsignmentSale } from "@/lib/consignment/trade-sales";
import { getConsignorSummary } from "@/lib/consignment/portal-data";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Record an off-Square consignment sale for a consignor — for an item that left inventory WITHOUT a matching
// Square order (rung up as a custom amount, given away, or manually adjusted out). We still owe the consignor
// their cut, so this books revenue the owed calculation counts, exactly like a trade sale. `revenue` is the full
// value the payout_rate applies to (a give-away books the list price so the consignor is still paid their %).
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/manual-sale", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;

        let body;
        try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

        const itemName = typeof body?.itemName === "string" ? body.itemName.trim() : "";
        const revenue = Number(body?.revenue);
        const quantity = body?.quantity == null ? 1 : Number(body.quantity);
        const variationId = typeof body?.variationId === "string" ? body.variationId.trim() || null : null;
        const squareItemId = typeof body?.squareItemId === "string" ? body.squareItemId.trim() || null : null;
        const soldAt = typeof body?.soldAt === "string" && !Number.isNaN(new Date(body.soldAt).getTime()) ? body.soldAt : null;
        const referenceId = typeof body?.referenceId === "string" ? body.referenceId.trim() || null : null;

        if (!itemName) return NextResponse.json({ error: "item_name_required" }, { status: 400 });
        if (!Number.isFinite(revenue) || revenue < 0) return NextResponse.json({ error: "invalid_revenue" }, { status: 400 });

        const { id } = await params;
        try {
            const consignor = await getConsignorById(id);
            if (!consignor) return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });

            const result = await recordManualConsignmentSale(id, { itemName, revenue, quantity, variationId, squareItemId, soldAt, referenceId });
            if (!result.ok) return NextResponse.json({ error: result.error || "record_failed" }, { status: 400 });

            // Return the recomputed summary so the caller can show the new owed balance immediately.
            const summary = await getConsignorSummary(id).catch(() => null);
            logger.info("admin.consignors.manual_sale.success", { consignorId: id, itemName, revenue, referenceId: result.referenceId });
            return NextResponse.json({ success: true, recorded: result, summary }, { status: 201 });
        } catch (error) {
            return internalError(error, { event: "admin.consignors.manual_sale.failure", consignorId: id });
        }
    });
}
