import "server-only";

import { db } from "@/lib/db";
import { resolveVariationCategories } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

// Records and reads off-Square consignment sales (see migrations/087). A consigned item taken as trade
// store-credit decrements Square inventory instead of creating a Square order, so the standard owed
// calculation (searchSalesForVariations) never sees it. These helpers keep the consignor's payable
// accurate for the portal, the admin app, and payouts.

const tradeSalesLogger = createServerLogger({ source: "api", subsystem: "consignment-trade-sales" });

async function loadActiveConsignorsByCategory() {
    const rows = await db.query(
        `SELECT id, square_category_id
           FROM consignors
          WHERE active = TRUE
            AND square_category_id IS NOT NULL
            AND square_category_id <> ''`
    );
    const byCategory = new Map();
    for (const row of rows) {
        byCategory.set(row.square_category_id, row.id);
    }
    return byCategory;
}

// Record consignment sales for the OUT (store-credit) lines of a trade. Idempotent per trade (unique on
// source+reference_id+variation), so a retry or a backfill re-runs safely. Returns { recorded } = number
// of consignor/variation groups written. Never throws for "no consigned items" — that's the common case.
export async function recordConsignmentTradeSalesForTrade(tradeId, outLines, { soldAt = null } = {}) {
    const id = String(tradeId || "").trim();
    if (!id) {
        return { recorded: 0 };
    }

    const lines = (Array.isArray(outLines) ? outLines : []).filter((line) => line && line.squareVariationId);
    if (!lines.length) {
        return { recorded: 0 };
    }

    const byCategory = await loadActiveConsignorsByCategory();
    if (byCategory.size === 0) {
        return { recorded: 0 };
    }

    const variationIds = Array.from(new Set(lines.map((line) => String(line.squareVariationId))));
    const variationCategories = await resolveVariationCategories(variationIds);

    // Group consigned OUT lines by (consignor, variation): the app posts one OUT line per unit, so a
    // customer taking two copies of the same consigned card is two lines we must sum.
    const groups = new Map();
    for (const line of lines) {
        const variationId = String(line.squareVariationId);
        const categories = variationCategories.get(variationId) || [];
        let consignorId = null;
        for (const category of categories) {
            if (byCategory.has(category)) {
                consignorId = byCategory.get(category);
                break;
            }
        }
        if (!consignorId) {
            continue; // not a consigned item
        }

        const quantity = Number(line.quantity) || 1;
        const lineTotal = Number(line.lineTotal ?? Number(line.unitMarket || 0) * quantity) || 0;
        const key = `${consignorId}::${variationId}`;
        const existing = groups.get(key) || {
            consignorId,
            variationId,
            squareItemId: line.squareItemId || null,
            itemName: String(line.itemName || "").trim() || "(item)",
            quantity: 0,
            revenue: 0,
        };
        existing.quantity += quantity;
        existing.revenue += lineTotal;
        groups.set(key, existing);
    }

    if (groups.size === 0) {
        return { recorded: 0 };
    }

    let recorded = 0;
    for (const group of groups.values()) {
        const unitPrice = group.quantity > 0 ? group.revenue / group.quantity : 0;
        await db.query(
            `INSERT INTO consignment_sale
                (consignor_id, source, reference_id, square_item_id, square_variation_id,
                 item_name, quantity, unit_price, revenue, sold_at)
             VALUES ($1, 'trade', $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
             ON CONFLICT (source, reference_id, square_variation_id)
             DO UPDATE SET quantity = EXCLUDED.quantity,
                           unit_price = EXCLUDED.unit_price,
                           revenue = EXCLUDED.revenue,
                           item_name = EXCLUDED.item_name,
                           square_item_id = EXCLUDED.square_item_id,
                           updated_at = NOW()`,
            [
                group.consignorId,
                id,
                group.squareItemId,
                group.variationId,
                group.itemName,
                group.quantity,
                unitPrice,
                group.revenue,
                soldAt,
            ]
        );
        recorded += 1;
    }

    tradeSalesLogger.info("consignment.trade_sales.recorded", { tradeId: id, groups: recorded });
    return { recorded };
}

// Trade-sourced consignment sales for a consignor, shaped exactly like searchSalesForVariations() entries
// so they merge into the portal + admin-app sales list and the owed calculation with no other changes.
export async function listConsignmentTradeSales(consignorId, { startAt = null, endAt = null } = {}) {
    if (!consignorId) {
        return [];
    }

    const clauses = ["consignor_id = $1"];
    const params = [consignorId];
    if (startAt) {
        params.push(startAt);
        clauses.push(`sold_at >= $${params.length}`);
    }
    if (endAt) {
        params.push(endAt);
        clauses.push(`sold_at <= $${params.length}`);
    }

    const rows = await db.query(
        `SELECT item_name,
                SUM(quantity)::int AS quantity_sold,
                SUM(revenue) AS revenue,
                MAX(sold_at) AS last_sold_at
           FROM consignment_sale
          WHERE ${clauses.join(" AND ")}
          GROUP BY item_name
          ORDER BY SUM(revenue) DESC`,
        params
    );

    return rows.map((row) => {
        const revenue = Number(row.revenue) || 0;
        return {
            name: row.item_name,
            imageUrl: null,
            quantitySold: Number(row.quantity_sold) || 0,
            quantityReturned: 0,
            grossRevenue: revenue,
            refundedRevenue: 0,
            revenue,
            lastSoldAt: row.last_sold_at ? new Date(row.last_sold_at).toISOString() : null,
            source: "trade",
        };
    });
}
