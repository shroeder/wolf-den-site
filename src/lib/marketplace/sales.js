import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// Sold tracking. When a vendor closes out a listing, we snapshot it into mkt_sale and flip the
// listing to status='sold' (so it leaves active inventory) — in one transaction. This is the first
// real transaction data the marketplace captures: it powers the "completed sales" reputation signal
// and is the seed for future monetization. See docs Phase 7.

const salesLogger = createServerLogger({ source: "api", subsystem: "marketplace-sales" });

// Mark a vendor's own active listing as sold. Vendor-scoped so one vendor can't close another's
// listing. Returns the recorded sale, or null if the listing wasn't found / already gone.
export async function markListingSold(listingId, vendorId) {
    return db.tx(async (client) => {
        const { rows: listingRows } = await client.query(
            `UPDATE mkt_listing
             SET status = 'sold', updated_at = NOW()
             WHERE id = $1 AND vendor_id = $2 AND status = 'active'
             RETURNING id, vendor_id, catalog_product_id, kind, title, price, quantity`,
            [listingId, vendorId]
        );

        const listing = listingRows[0];
        if (!listing) {
            return null;
        }

        const { rows: saleRows } = await client.query(
            `INSERT INTO mkt_sale
                (vendor_id, listing_id, catalog_product_id, title, kind, price, quantity)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, sold_at`,
            [
                listing.vendor_id,
                listing.id,
                listing.catalog_product_id,
                listing.title,
                listing.kind,
                listing.price,
                listing.quantity,
            ]
        );

        salesLogger.info("marketplace.sale.recorded", {
            step: "sale_recorded",
            saleId: saleRows[0].id,
            listingId: listing.id,
            vendorId,
        });

        return {
            id: saleRows[0].id,
            listingId: listing.id,
            soldAt: saleRows[0].sold_at ? new Date(saleRows[0].sold_at).toISOString() : null,
        };
    });
}

// Count of completed sales for a vendor (reputation signal).
export async function getVendorSalesCount(vendorId) {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS count FROM mkt_sale WHERE vendor_id = $1`,
        [vendorId]
    );

    return row ? row.count : 0;
}
