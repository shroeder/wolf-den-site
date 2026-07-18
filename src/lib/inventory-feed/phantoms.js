import "server-only";

import { db } from "@/lib/db";
import { adjustInventoryForSale } from "@/lib/consignment/square.js";

// PHANTOM RECONCILER — cross-checks the ledgers (trades out, mystery-packed, consignment sold) against
// what Square still reports IN_STOCK, and lists the mismatches so the Remediations tab can review + fix
// them. Read-only until an operator explicitly applies a fix.

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
                -- Traded away at least as many as we took in, yet still in stock.
                SELECT f.variation_id, f.name, f.quantity::int qty, f.price, a.out_q gone, 'traded_out' reason, a.last_at at
                FROM agg a JOIN inventory_feed f ON f.variation_id = a.vid
                WHERE f.in_stock AND a.out_q > 0 AND a.out_q >= a.in_q
                UNION ALL
                -- Committed into an active mystery bag but the loose single still shows in stock.
                SELECT f.variation_id, f.name, f.quantity::int, f.price, 1, 'mystery_packed', m.created_at
                FROM mystery_bag_cards m JOIN inventory_feed f ON f.variation_id = m.square_variation_id
                WHERE m.status = 'active' AND m.item_type = 'card' AND f.in_stock
                UNION ALL
                -- Consignment-sold but still in stock.
                SELECT f.variation_id, f.name, f.quantity::int, f.price, c.quantity::int, 'consignment_sold', c.sold_at
                FROM consignment_sale c JOIN inventory_feed f ON f.variation_id = c.square_variation_id
                WHERE f.in_stock
            )
            SELECT DISTINCT ON (variation_id) variation_id, name, qty, price, gone, reason, at
            FROM cand ORDER BY variation_id, (reason = 'mystery_packed') DESC, at DESC
            LIMIT $1`,
            [Math.max(1, Math.min(1000, Math.floor(Number(limit) || 300)))]
        )
        .catch(() => []);
    return rows
        .map((r) => {
            const qty = Number(r.qty) || 0;
            const gone = Math.min(qty, Math.max(1, Number(r.gone) || 1));
            // The ONLY reliable phantom is a double-count: a single that's inside a mystery bag AND still
            // showing loose (physically impossible). "Traded away" / "consignment sold" can't account for
            // restocks (restocks aren't linked to a card), so they're only hints to verify — never proof.
            const doubleCounted = r.reason === "mystery_packed" && qty <= 1;
            const confidence = doubleCounted ? "high" : "verify";
            const confidenceLabel = doubleCounted
                ? "Double-counted — it's in a mystery bag AND still loose"
                : r.reason === "traded_out"
                ? "Verify — we traded this away, but restocks aren't tracked per card, so you may still have copies"
                : r.reason === "mystery_packed"
                ? "Verify — packed in a mystery bag (bulk source, may still have loose copies)"
                : "Verify — consignment sold, but you may still have copies";
            return {
                variationId: r.variation_id,
                name: r.name,
                quantity: qty,
                price: r.price != null ? Number(r.price) : null,
                reason: r.reason, // traded_out | mystery_packed | consignment_sold
                suggestedFixQty: gone,
                confidence,
                confidenceLabel,
                lastEvent: r.at,
            };
        })
        // Reliable double-counts first, then by value.
        .sort((a, b) => (a.confidence === b.confidence ? (b.price || 0) - (a.price || 0) : a.confidence === "high" ? -1 : 1));
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
