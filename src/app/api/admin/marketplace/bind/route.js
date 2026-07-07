import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The set of already-bound Square item ids, so the admin app can show only items that still need
// binding (regardless of whether they have an image).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/marketplace/bind", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const rows = await db.query(`SELECT square_item_id FROM mkt_square_binding`);
            return NextResponse.json({ squareItemIds: rows.map((r) => r.square_item_id) });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.bind.list.failure" });
        }
    });
}

// Bind a Square item to a TCGplayer catalog product (from an approved AI match in the admin app), so
// the marketplace sync can list it even though its SKU isn't a TCG- id. Body: { squareItemId,
// catalogProductId }. Pass catalogProductId=null to remove a binding.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/marketplace/bind", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            const squareItemId = String(body?.squareItemId || "").trim();
            const catalogProductId = body?.catalogProductId;

            if (!squareItemId) {
                return NextResponse.json({ error: "squareItemId is required" }, { status: 400 });
            }

            if (catalogProductId === null || catalogProductId === undefined || catalogProductId === "") {
                await db.query(`DELETE FROM mkt_square_binding WHERE square_item_id = $1`, [squareItemId]);
                logger.info("admin.marketplace.bind.removed", { squareItemId });
                return NextResponse.json({ ok: true, removed: true });
            }

            const productId = Number(catalogProductId);
            if (!Number.isInteger(productId) || productId <= 0) {
                return NextResponse.json({ error: "catalogProductId must be a positive integer" }, { status: 400 });
            }

            // Guard the catalog id actually exists.
            const found = await db.queryOne(`SELECT id FROM tcg_cards WHERE id = $1`, [productId]);
            if (!found) {
                return NextResponse.json({ error: "catalogProductId not found in catalog" }, { status: 400 });
            }

            await db.query(
                `INSERT INTO mkt_square_binding (square_item_id, catalog_product_id)
                 VALUES ($1, $2)
                 ON CONFLICT (square_item_id)
                 DO UPDATE SET catalog_product_id = EXCLUDED.catalog_product_id, updated_at = NOW()`,
                [squareItemId, productId],
            );
            logger.info("admin.marketplace.bind.set", { squareItemId, catalogProductId: productId });
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.bind.failure" });
        }
    });
}
