import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// Auto-pricing engine. A listing's pricing_mode drives its price:
//   market_pct   -> market_price * pricing_value   (value = fraction, e.g. 0.90)
//   match_lowest -> lowest competing vendor price - pricing_value  (value = undercut $, default 0)
// A nightly job recomputes these. SAFETY: automated pricing never drops below a market-relative floor
// (half of market), so two "match lowest" vendors can't chase each other to zero.

const repriceLogger = createServerLogger({ source: "job", subsystem: "marketplace-reprice" });

export const PRICING_MODES = new Set(["manual", "market_pct", "match_lowest"]);
const HARD_FLOOR = 0.25;
const MIN_MARKET_FRACTION = 0.5; // never auto-price below 50% of market

function round2(n) {
    return Math.round(n * 100) / 100;
}

function autoFloor(marketPrice) {
    return marketPrice != null ? Math.max(HARD_FLOOR, round2(marketPrice * MIN_MARKET_FRACTION)) : HARD_FLOOR;
}

// Target price for an auto listing, or null if it can't be computed (leave price unchanged).
export function computeAutoPrice({ mode, value, marketPrice, lowestPrice }) {
    const floor = autoFloor(marketPrice);

    if (mode === "market_pct") {
        const pct = Number(value);
        if (marketPrice == null || !(pct > 0)) return null;
        return Math.max(floor, round2(marketPrice * pct));
    }

    if (mode === "match_lowest") {
        const delta = Number(value) || 0;
        if (lowestPrice == null) {
            // No competitor to match — fall back to market if known, else leave as-is.
            return marketPrice != null ? Math.max(floor, round2(marketPrice)) : null;
        }
        return Math.max(floor, round2(lowestPrice - delta));
    }

    return null;
}

// Recompute every active auto-priced listing. Idempotent; only writes when the price actually changes.
export async function repriceActiveListings() {
    const rows = await db.query(
        `SELECT l.id, l.vendor_id, l.pricing_mode, l.pricing_value, l.price, l.catalog_product_id,
                c.market_price,
                (SELECT MIN(l2.price)
                   FROM mkt_listing l2
                   JOIN mkt_vendor v2 ON v2.id = l2.vendor_id AND v2.status = 'active'
                  WHERE l2.catalog_product_id = l.catalog_product_id
                    AND l2.status = 'active'
                    AND NOT l2.vendor_only
                    AND l2.vendor_id <> l.vendor_id) AS lowest_price
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE l.status = 'active' AND l.pricing_mode <> 'manual'`
    );

    let updated = 0;
    for (const r of rows) {
        const target = computeAutoPrice({
            mode: r.pricing_mode,
            value: r.pricing_value,
            marketPrice: r.market_price != null ? Number(r.market_price) : null,
            lowestPrice: r.lowest_price != null ? Number(r.lowest_price) : null,
        });

        if (target == null) continue;
        if (Number(r.price) !== target) {
            await db.query(`UPDATE mkt_listing SET price = $2, updated_at = NOW() WHERE id = $1`, [r.id, target]);
            updated += 1;
        }
    }

    repriceLogger.info("marketplace.reprice.done", { considered: rows.length, updated });
    return { considered: rows.length, updated };
}

// Compute the price for a single listing right now (used at create/update time so the stored price is
// correct immediately, before the nightly job runs). Needs the listing's catalog product for context.
export async function computeListingPriceNow({ catalogProductId, vendorId, mode, value }) {
    if (mode === "manual" || !catalogProductId) return null;

    const row = await db.queryOne(
        `SELECT c.market_price,
                (SELECT MIN(l2.price)
                   FROM mkt_listing l2
                   JOIN mkt_vendor v2 ON v2.id = l2.vendor_id AND v2.status = 'active'
                  WHERE l2.catalog_product_id = $1
                    AND l2.status = 'active'
                    AND NOT l2.vendor_only
                    AND ($2::uuid IS NULL OR l2.vendor_id <> $2)) AS lowest_price
         FROM tcg_cards c
         WHERE c.id = $1`,
        [catalogProductId, vendorId || null]
    );

    if (!row) return null;

    return computeAutoPrice({
        mode,
        value,
        marketPrice: row.market_price != null ? Number(row.market_price) : null,
        lowestPrice: row.lowest_price != null ? Number(row.lowest_price) : null,
    });
}
