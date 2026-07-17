import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Search the synced Square catalog (inventory_feed) by name — for picking a boss raffle prize (needs an
// image to display). Admin-gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/square-items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const params = new URL(request.url).searchParams;
            const q = (params.get("q") || "").trim();
            if (q.length < 2) return noStore({ items: [] });
            // inStock=1 (default) restricts to items actually on hand — used by the restock "pay with
            // product" picker so you can only give inventory you own. Returns qty + price for display.
            const inStockOnly = params.get("inStock") !== "0";
            const rows = await db
                .query(
                    `SELECT variation_id AS id, name, image_url AS "imageUrl", price, quantity
                       FROM inventory_feed
                      WHERE image_url IS NOT NULL AND name ILIKE $1
                        ${inStockOnly ? "AND in_stock = TRUE AND quantity > 0" : ""}
                      ORDER BY (in_stock) DESC, name LIMIT 25`,
                    [`%${q}%`]
                )
                .catch(() => []);
            return noStore({ items: rows });
        } catch (error) {
            return internalError(error, { event: "admin.square_items.search.failure" });
        }
    });
}
