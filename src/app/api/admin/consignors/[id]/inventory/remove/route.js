import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { removeConsignorItem } from "@/lib/admin/consignor-inventory";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── TAKE AN ITEM OFF CONSIGNMENT ─────────────────────────────────────────────────────────────────────────
// ⚠️ THIS IS THE URL THE APP HAS BEEN CALLING SINCE THE REMOVE BUTTON SHIPPED, AND IT DID NOT EXIST.
// ConsignmentAdminApiClient.removeConsignorInventoryItem tries this first, then two DELETE shapes, then
// throws "endpoint not found for this backend deployment" — so "Remove From Consignment" has been a fully
// wired button, with a confirm dialog, that could never once have worked. Matching the URL the client
// already uses fixes it without shipping an app build.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/inventory/remove", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const variationId = String(body?.variationId || "").trim();
            if (!variationId) return NextResponse.json({ error: "variation_required" }, { status: 400 });
            const r = await removeConsignorItem(variationId);
            return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "consignor.inventory.remove.failure" });
        }
    });
}
