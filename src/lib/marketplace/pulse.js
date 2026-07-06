import "server-only";

import { db } from "@/lib/db";

// "Activity pulse" for the browse home: what people are hunting (trending searches), what just hit
// the marketplace (recent listings), and headline counts for social proof. Public, anonymous.
export async function getMarketplacePulse() {
    const [trending, justListed, mostWanted, deals, stats] = await Promise.all([
        db.query(
            `SELECT lower(search_term) AS term, count(*)::int AS n
             FROM mkt_engagement
             WHERE kind = 'search' AND search_term IS NOT NULL AND search_term <> ''
               AND created_at >= NOW() - INTERVAL '14 days'
             GROUP BY lower(search_term)
             ORDER BY n DESC
             LIMIT 8`,
        ),
        // One row per product (most recently listed), newest first.
        db.query(
            `SELECT id, name, image_url, set_name, price, vendor
             FROM (
                 SELECT DISTINCT ON (l.catalog_product_id)
                        l.catalog_product_id AS id, c.name, c.image_url, s.name AS set_name,
                        l.price, v.display_name AS vendor, l.created_at
                 FROM mkt_listing l
                 JOIN tcg_cards c ON c.id = l.catalog_product_id
                 JOIN tcg_sets s ON s.id = c.set_id
                 JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
                 WHERE l.status = 'active' AND NOT l.vendor_only AND l.catalog_product_id IS NOT NULL
                 ORDER BY l.catalog_product_id, l.created_at DESC
             ) t
             ORDER BY t.created_at DESC
             LIMIT 12`,
        ),
        // Wanted board: aggregate wishlists into demand. in_stock flags whether it's currently
        // listed (so it doubles as a "what to stock" signal for vendors).
        db.query(
            `SELECT w.catalog_product_id AS id, c.name, c.image_url, s.name AS set_name,
                    count(DISTINCT w.email_normalized)::int AS wants,
                    EXISTS(
                        SELECT 1 FROM mkt_listing l
                        WHERE l.catalog_product_id = w.catalog_product_id
                          AND l.status = 'active' AND NOT l.vendor_only
                    ) AS in_stock
             FROM mkt_want w
             JOIN tcg_cards c ON c.id = w.catalog_product_id
             JOIN tcg_sets s ON s.id = c.set_id
             GROUP BY w.catalog_product_id, c.name, c.image_url, s.name
             ORDER BY wants DESC, c.name ASC
             LIMIT 12`,
        ),
        // Deals: active listings priced below the catalog market price, biggest discount first.
        db.query(
            `SELECT l.catalog_product_id AS id, c.name, c.image_url, s.name AS set_name,
                    MIN(l.price) AS price, c.market_price,
                    round((1 - MIN(l.price) / NULLIF(c.market_price, 0)) * 100)::int AS pct_under
             FROM mkt_listing l
             JOIN tcg_cards c ON c.id = l.catalog_product_id
             JOIN tcg_sets s ON s.id = c.set_id
             WHERE l.status = 'active' AND NOT l.vendor_only AND c.market_price > 0 AND l.price < c.market_price
             GROUP BY l.catalog_product_id, c.name, c.image_url, s.name, c.market_price
             ORDER BY pct_under DESC
             LIMIT 12`,
        ),
        db.queryOne(
            `SELECT
                 (SELECT count(*)::int FROM mkt_listing WHERE status = 'active' AND NOT vendor_only) AS listings,
                 (SELECT count(*)::int FROM mkt_vendor WHERE status = 'active') AS vendors,
                 (SELECT count(*)::int FROM mkt_engagement WHERE kind = 'search' AND created_at >= NOW() - INTERVAL '7 days') AS searches`,
        ),
    ]);

    return {
        trending: trending.map((r) => r.term),
        justListed: justListed.map((r) => ({
            id: r.id,
            name: r.name,
            imageUrl: r.image_url || null,
            setName: r.set_name || null,
            price: r.price == null ? null : Number(r.price),
            vendor: r.vendor || null,
        })),
        deals: deals.map((r) => ({
            id: r.id,
            name: r.name,
            imageUrl: r.image_url || null,
            setName: r.set_name || null,
            price: r.price == null ? null : Number(r.price),
            marketPrice: r.market_price == null ? null : Number(r.market_price),
            pctUnder: r.pct_under,
        })),
        mostWanted: mostWanted.map((r) => ({
            id: r.id,
            name: r.name,
            imageUrl: r.image_url || null,
            setName: r.set_name || null,
            wants: r.wants,
            inStock: r.in_stock === true,
        })),
        stats: {
            listings: stats?.listings || 0,
            vendors: stats?.vendors || 0,
            searches: stats?.searches || 0,
        },
    };
}
