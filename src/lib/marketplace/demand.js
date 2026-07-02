import "server-only";

import { db } from "@/lib/db";

// Record a buyer's interest in a product (Vendor Heat Map signal). Bounded — one counter row per
// product per day.
export async function recordProductView(catalogProductId) {
    const id = Number(catalogProductId);
    if (!Number.isFinite(id) || id <= 0) {
        return;
    }
    await db.query(
        `INSERT INTO mkt_product_demand (catalog_product_id, day, views)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (catalog_product_id, day) DO UPDATE SET views = mkt_product_demand.views + 1`,
        [id]
    );
}

// Vendor Heat Map: most-viewed products over the last N days, with how many vendors carry each (supply)
// and whether the requesting vendor does — so "hot but nobody stocks it" jumps out.
export async function listSearchDemand({ vendorId = null, limit = 15, days = 7 } = {}) {
    const rows = await db.query(
        `SELECT d.catalog_product_id AS id, SUM(d.views)::int AS views,
                c.name, c.game, c.image_url, s.name AS set_name,
                (SELECT COUNT(DISTINCT l.vendor_id) FROM mkt_listing l
                   WHERE l.catalog_product_id = d.catalog_product_id AND l.status = 'active')::int AS vendor_count,
                EXISTS (SELECT 1 FROM mkt_listing l2
                   WHERE l2.catalog_product_id = d.catalog_product_id AND l2.vendor_id = $2 AND l2.status = 'active') AS you_carry
         FROM mkt_product_demand d
         JOIN tcg_cards c ON c.id = d.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE d.day >= CURRENT_DATE - $1::int
         GROUP BY d.catalog_product_id, c.name, c.game, c.image_url, s.name
         ORDER BY views DESC
         LIMIT $3`,
        [days, vendorId, limit]
    );
    return rows.map((r) => ({
        catalogProductId: String(r.id),
        name: r.name,
        setName: r.set_name,
        game: r.game,
        imageUrl: r.image_url,
        views: Number(r.views) || 0,
        vendorCount: Number(r.vendor_count) || 0,
        youCarry: r.you_carry === true,
    }));
}
