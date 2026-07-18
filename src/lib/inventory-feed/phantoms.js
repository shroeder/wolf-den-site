import "server-only";

import { db } from "@/lib/db";
import { adjustInventoryForSale } from "@/lib/consignment/square.js";

// PHANTOM RECONCILER — cross-checks the ledgers (trades out, mystery-packed, consignment sold) against
// what Square still reports IN_STOCK, and lists the mismatches so the Remediations tab can review + fix
// them. Read-only until an operator explicitly applies a fix.
//
// Scoped to POKEMON SINGLES (Luke's concern). Singles are UNIQUE — a re-acquired card gets a new Square
// variation — so "left the store (traded/sold/packed) but the same variation still shows in stock" is a
// reliable phantom, with none of the restock-multiples noise that plagues sealed products.
const SINGLES_CATEGORY = "Pokemon Single Card";

// Candidate phantoms across all "card left" sources, deduped by variation (strongest reason wins).
export async function listPhantoms(limit = 300) {
    const rows = await db
        .query(
            `
            WITH agg AS (
                SELECT square_variation_id vid,
                       SUM(CASE WHEN direction = 'IN'  THEN quantity ELSE 0 END)::int in_q,
                       SUM(CASE WHEN direction = 'OUT' THEN quantity ELSE 0 END)::int out_q,
                       MAX(created_at) last_at
                FROM trade_line WHERE square_variation_id IS NOT NULL GROUP BY 1
            ),
            cand AS (
                -- Traded away, yet the same unique single still shows in stock.
                SELECT f.variation_id, f.name, f.quantity::int qty, f.price, a.out_q gone, 'traded_out' reason, a.last_at at
                FROM agg a JOIN inventory_feed f ON f.variation_id = a.vid
                WHERE f.in_stock AND f.category_names = $2 AND a.out_q > 0 AND a.out_q >= a.in_q
                UNION ALL
                -- Committed into an active mystery bag but the loose single still shows in stock.
                SELECT f.variation_id, f.name, f.quantity::int, f.price, 1, 'mystery_packed', m.created_at
                FROM mystery_bag_cards m JOIN inventory_feed f ON f.variation_id = m.square_variation_id
                WHERE m.status = 'active' AND f.in_stock AND f.category_names = $2
                UNION ALL
                -- Consignment-sold but still in stock.
                SELECT f.variation_id, f.name, f.quantity::int, f.price, c.quantity::int, 'consignment_sold', c.sold_at
                FROM consignment_sale c JOIN inventory_feed f ON f.variation_id = c.square_variation_id
                WHERE f.in_stock AND f.category_names = $2
            )
            SELECT DISTINCT ON (variation_id) variation_id, name, qty, price, gone, reason, at
            FROM cand ORDER BY variation_id, (reason = 'mystery_packed') DESC, at DESC
            LIMIT $1`,
            [Math.max(1, Math.min(1000, Math.floor(Number(limit) || 300))), SINGLES_CATEGORY]
        )
        .catch(() => []);
    return rows
        .map((r) => {
            // These are all unique Pokémon singles, so every candidate is a genuine phantom (a single that
            // left the store but still shows in stock). High confidence across the board.
            const confidenceLabel =
                r.reason === "mystery_packed"
                    ? "Packed in a mystery bag — but the single still shows in stock"
                    : r.reason === "traded_out"
                    ? "Traded away — but the single still shows in stock"
                    : "Consignment sold — but the single still shows in stock";
            return {
                variationId: r.variation_id,
                name: r.name,
                quantity: Number(r.qty) || 0,
                price: r.price != null ? Number(r.price) : null,
                reason: r.reason, // traded_out | mystery_packed | consignment_sold
                suggestedFixQty: 1, // singles
                confidence: "high",
                confidenceLabel,
                lastEvent: r.at,
            };
        })
        .sort((a, b) => (b.price || 0) - (a.price || 0));
}

// Apply a fix: mark `quantity` units of a variation SOLD in Square (IN_STOCK -> SOLD), mirror it in the
// feed, and resolve any matching repair-queue rows. Stable idempotency key so re-applying can't double it.
export async function applyPhantomFix(variationId, quantity = 1) {
    if (!variationId) return { ok: false, error: "missing_variation" };
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    await adjustInventoryForSale([{ catalogObjectId: variationId, quantity: q }], { idempotencyKey: `phantom-fix-${variationId}-${q}` });
    await db
        .query(
            `UPDATE inventory_feed SET quantity = GREATEST(0, quantity - $2), in_stock = (quantity - $2) > 0,
                    last_change_kind = 'phantom_fix', last_change_at = NOW(), updated_at = NOW()
              WHERE variation_id = $1`,
            [variationId, q]
        )
        .catch(() => {});
    await db.query(`UPDATE inventory_repair SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE variation_id = $1 AND status = 'open'`, [variationId]).catch(() => {});
    return { ok: true, quantity: q };
}
