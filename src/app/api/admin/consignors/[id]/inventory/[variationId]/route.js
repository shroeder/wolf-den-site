import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { removeConsignorItem, updateConsignorItem } from "@/lib/admin/consignor-inventory";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// PATCH  edit one item: any subset of { priceCents, quantity, name, description }
// DELETE take it off consignment (the client's fallback shape; the /remove POST is its first choice)
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/consignors/[id]/inventory/[variationId]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;
        try {
            const { variationId } = await params;
            const body = await request.json().catch(() => ({}));
            const r = await updateConsignorItem(variationId, {
                priceCents: body?.priceCents ?? null,
                quantity: body?.quantity ?? null,
                name: body?.name ?? null,
                description: body?.description ?? null,
            });
            return noStore(r, { status: r.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "consignor.inventory.update.failure" });
        }
    });
}

export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/admin/consignors/[id]/inventory/[variationId]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;
        try {
            const { variationId } = await params;
            return noStore(await removeConsignorItem(variationId));
        } catch (error) {
            return internalError(error, { event: "consignor.inventory.delete.failure" });
        }
    });
}
