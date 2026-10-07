import "server-only";

import { db } from "@/lib/db";

// ── FINDING A PRODUCT TO PUT A RULE ON ───────────────────────────────────────────────────────────────────────
// The app needs to search the catalogue by name to pick a variation.
//
// ⚠️ SEARCHED AGAINST inventory_feed, NOT AGAINST SQUARE. The feed is already a local mirror of every sellable
// variation, so this is one indexed query against our own database instead of a catalogue call per keystroke.
// Square's search endpoint would be both slower and rate-limited, and typing is exactly the thing that
// generates a lot of calls.
//
// The feed can be a few minutes behind on a brand-new item. That is fine here: a rule set on a variation id
// works whether or not the feed has caught up, and the id is what gets stored.

export async function searchSellableVariations(query, { limit = 25 } = {}) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];

    // Every word has to appear somewhere in the name, in any order — "journey box" finds
    // "Pokemon Sv9 Journey Together Booster Box". Matching the raw string would not.
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    const clauses = terms.map((_, i) => `f.name ILIKE $${i + 1}`).join(" AND ");
    const params = terms.map((t) => `%${t}%`);
    params.push(limit);

    const rows = await db.query(
        `SELECT f.variation_id, f.name, f.quantity, f.price, f.category_names, f.image_url,
                r.pickup_only, r.limit_per_customer, r.run_started_at
           FROM inventory_feed f
           LEFT JOIN shop_item_rules r ON r.variation_id = f.variation_id
          WHERE ${clauses}
          ORDER BY (f.quantity > 0) DESC, f.name ASC
          LIMIT $${params.length}`,
        params,
    ).catch(() => []);

    return (rows || []).map((r) => ({
        variationId: r.variation_id,
        name: r.name,
        stock: Number(r.quantity) || 0,
        price: r.price == null ? null : Number(r.price),
        category: r.category_names || null,
        imageUrl: r.image_url || null,
        pickupOnly: Boolean(r.pickup_only),
        limitPerCustomer: r.limit_per_customer == null ? null : Number(r.limit_per_customer),
        runStartedAt: r.run_started_at || null,
    }));
}
