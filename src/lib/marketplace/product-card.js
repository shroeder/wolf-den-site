import "server-only";

import { db } from "@/lib/db";

// Lightweight product summaries for rendering a shared product inside a message. Batch-resolves several
// catalog product ids to { id, name, imageUrl, setName, game, price } (lowest active listing, else market).
export async function getProductCards(ids) {
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!unique.length) return {};
    const rows = await db
        .query(
            `SELECT c.id, c.name, c.image_url, c.market_price, c.game, s.name AS set_name,
                    (SELECT MIN(l.price) FROM mkt_listing l
                      WHERE l.catalog_product_id = c.id AND l.status = 'active' AND NOT l.vendor_only) AS low_price
               FROM tcg_cards c JOIN tcg_sets s ON s.id = c.set_id
              WHERE c.id = ANY($1)`,
            [unique]
        )
        .catch(() => []);
    const map = {};
    for (const r of rows) {
        const price = r.low_price != null ? Number(r.low_price) : r.market_price != null ? Number(r.market_price) : null;
        map[String(r.id)] = {
            id: String(r.id),
            name: r.name,
            imageUrl: r.image_url || null,
            setName: r.set_name || null,
            game: r.game || null,
            price: Number.isFinite(price) ? price : null,
        };
    }
    return map;
}
