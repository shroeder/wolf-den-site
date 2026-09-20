import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "cogs-fifo" });

// ── WHAT A SALE ACTUALLY COST ────────────────────────────────────────────────────────────────────────────────
// Luke: "It's supposed to be first in, first out. Meaning if we bought 12 ETBs at 120 and the remaining at 115,
// it should reflect that in order."
//
// The old model was one cost per item, overwritten by the newest restock. This one keeps the purchases as
// BATCHES and spends them oldest first, which is the only model that can answer "what did THIS sale cost"
// when the same item was bought at two prices.
//
// Everything here is in CENTS and integer arithmetic. paid_each is a dollars numeric in the ledger and a
// fractional cent per unit becomes a real discrepancy over a few hundred units, so the conversion happens
// once, at the edge, and nothing downstream sees a float.

/** A ledger row, in the shape the allocator wants. Oldest first is the caller's job. */
const toBatch = (row) => ({
    ledgerId: String(row.id),
    occurredOn: row.occurred_on instanceof Date ? row.occurred_on.toISOString().slice(0, 10) : String(row.occurred_on).slice(0, 10),
    units: Math.max(0, Number(row.quantity) || 0),
    paidEachCents: Math.round((Number(row.paid_each) || 0) * 100),
});

/**
 * Spend `units` against `batches`, oldest first, starting `alreadySold` units in.
 *
 * PURE. No database, no clock — so the interesting cases can be written down as tests rather than argued
 * about. Returns { costCents, units, batches, short } where `short` is how many units the batches could not
 * pay for.
 *
 * ⚠️ RUNNING OUT OF BATCHES IS NOT AN ERROR, AND IT MUST NOT BE COSTED AS ZERO. Stock predates the ledger,
 * gets counted in by hand, arrives as a gift; a sale can legitimately have no purchase behind it. Those units
 * are reported as `short` and the caller decides — the one thing that must never happen is a silent $0 that
 * turns into 100% margin on a report.
 */
export function allocate(batches, alreadySold, units) {
    const want = Math.max(0, Number(units) || 0);
    let skip = Math.max(0, Number(alreadySold) || 0);
    let left = want;
    let costCents = 0;
    const used = [];

    for (const b of batches) {
        if (left <= 0) break;
        let available = b.units;
        if (skip > 0) {
            const eaten = Math.min(skip, available);
            skip -= eaten;
            available -= eaten;
        }
        if (available <= 0) continue;
        const take = Math.min(available, left);
        costCents += Math.round(take * b.paidEachCents);
        used.push({ ledgerId: b.ledgerId, units: take, paidEachCents: b.paidEachCents });
        left -= take;
    }

    return { costCents, units: want - left, batches: used, short: left };
}

/** Purchase batches per variation, oldest first. `created_at` breaks ties so same-day restocks keep their order. */
export async function batchesFor(variationIds) {
    const ids = [...new Set((variationIds || []).map((v) => String(v || "").trim()).filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await db.query(
        `SELECT id, variation_id, occurred_on, quantity, paid_each
           FROM cogs_ledger
          WHERE variation_id = ANY($1) AND quantity > 0
          ORDER BY occurred_on ASC, created_at ASC`,
        [ids]
    ).catch((error) => {
        logger.warn("cogs.fifo.batches_failed", { message: error?.message });
        return [];
    });

    const out = new Map();
    for (const r of rows) {
        const key = String(r.variation_id);
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(toBatch(r));
    }
    return out;
}

/**
 * Units of each variation already spent by sales costed in EARLIER runs — the opening position for an
 * incremental walk, keyed variationId -> units.
 *
 * `before` is the oldest sale about to be costed. Rows at or after it are excluded because the caller is
 * recomputing them; counting them here would consume their batches twice and silently overprice everything
 * behind them.
 */
export async function priorConsumption(variationIds, before) {
    const ids = [...new Set((variationIds || []).map((v) => String(v || "").trim()).filter(Boolean))];
    const out = new Map();
    if (!ids.length || !before) return out;
    const rows = await db.query(
        `SELECT variation_id, COALESCE(SUM(units), 0) AS used
           FROM cogs_fifo_cost
          WHERE variation_id = ANY($1) AND sold_at < $2
          GROUP BY variation_id`,
        [ids, new Date(before).toISOString()]
    ).catch((error) => {
        // ⚠️ LOUD, AND EMPTY IS NOT A SAFE ANSWER HERE. Returning an empty map on failure would look exactly
        // like "nothing has been sold yet" and hand every sale the oldest batch — the bug this function exists
        // to prevent. The caller treats a throw as a failed run rather than costing anything wrongly.
        logger.error("cogs.fifo.prior_consumption_failed", { message: error?.message });
        throw error;
    });
    for (const r of rows) out.set(String(r.variation_id), Number(r.used) || 0);
    return out;
}

/**
 * Cost every sale of these variations, oldest sale first, and write the answers down.
 *
 * `sales` is [{ orderId, lineUid, variationId, soldAt, units }] — the caller supplies them from Square, which
 * cannot filter orders by item, so the scan belongs to whoever already has the order history in hand.
 *
 * ⚠️ SORTED HERE, NOT TRUSTED FROM THE CALLER. FIFO is an ordering, so a sale arriving out of order would be
 * handed the wrong batch and the error would persist in the stored row. Sorting costs nothing against being
 * wrong quietly.
 */
export async function costSales(sales) {
    const list = (Array.isArray(sales) ? sales : [])
        .map((s) => ({
            orderId: String(s?.orderId || "").trim(),
            lineUid: String(s?.lineUid || "").trim(),
            variationId: String(s?.variationId || "").trim(),
            soldAt: s?.soldAt ? new Date(s.soldAt) : null,
            units: Number(s?.units) || 0,
        }))
        .filter((s) => s.orderId && s.lineUid && s.variationId && s.soldAt && s.units > 0)
        .sort((a, b) => a.soldAt - b.soldAt || a.orderId.localeCompare(b.orderId) || a.lineUid.localeCompare(b.lineUid));

    if (!list.length) return { costed: 0, short: 0, skipped: 0 };

    const batches = await batchesFor(list.map((s) => s.variationId));

    // ── ⚠️ WHAT EARLIER RUNS ALREADY SPENT, NOT JUST THIS ONE ────────────────────────────────────────────────
    // `consumed` used to start empty on every call, and the reconciler only walks forward from its cursor — so
    // the FIRST sale of an item in tonight's incremental run was handed the OLDEST batch again, one that sales
    // months ago had already emptied. Buy 11 ETBs at $120 and 5 at $115, sell 11, and the twelfth sale would
    // read $120 for ever, which is the exact "last price wins" defect this table was built to kill, coming back
    // one night later and much harder to see.
    //
    // A full run clears the table first, so this correctly reads zero there. An incremental run reads the units
    // every prior run recorded for sales STRICTLY OLDER than the oldest sale in this walk — anything inside the
    // walk is about to be recomputed from scratch, so counting it here would spend those units twice.
    const consumed = await priorConsumption(list.map((s) => s.variationId), list[0].soldAt);
    let costed = 0, short = 0, skipped = 0;

    for (const sale of list) {
        const mine = batches.get(sale.variationId);
        // No purchase history for this item at all — nothing to say, so say nothing. A row is never written
        // with a zero cost; see the note on allocate().
        if (!mine?.length) { skipped += 1; continue; }

        const already = consumed.get(sale.variationId) || 0;
        const result = allocate(mine, already, sale.units);
        consumed.set(sale.variationId, already + sale.units);

        if (result.units <= 0) { skipped += 1; continue; }
        if (result.short > 0) short += 1;

        // ⚠️ `short` IS RECORDED, NOT ROUNDED AWAY. The row is written either way, because the units were
        // sold and remainingFor() has to count them or the shelf valuation overstates what is left. But a
        // short row is NOT safe to report: the app applies the stored cost as the cost of the whole line, so
        // handing it a figure that only covers part of the line prices the rest at nothing — the exact
        // silent $0 the note on allocate() forbids. storedCosts() filters these out, and the line falls back
        // to the old per-unit cost, which at least prices every unit.
        await db.query(
            `INSERT INTO cogs_fifo_cost (order_id, line_uid, variation_id, sold_at, units, cost_cents, batches, short_units, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
             ON CONFLICT (order_id, line_uid) DO UPDATE
                SET variation_id = EXCLUDED.variation_id, sold_at = EXCLUDED.sold_at, units = EXCLUDED.units,
                    cost_cents = EXCLUDED.cost_cents, batches = EXCLUDED.batches,
                    short_units = EXCLUDED.short_units, computed_at = NOW()`,
            [sale.orderId, sale.lineUid, sale.variationId, sale.soldAt.toISOString(), sale.units,
             result.costCents, JSON.stringify(result.batches), result.short]
        ).catch((error) => {
            logger.warn("cogs.fifo.write_failed", { orderId: sale.orderId, message: error?.message });
        });
        costed += 1;
    }

    logger.info("cogs.fifo.costed", { costed, short, skipped });
    return { costed, short, skipped };
}

/** The stored cost for a set of sold lines, keyed "orderId|lineUid". Used by the proxy to annotate a report. */
export async function storedCosts(pairs) {
    const list = (Array.isArray(pairs) ? pairs : []).filter((p) => p?.orderId && p?.lineUid);
    if (!list.length) return new Map();
    // short_units = 0 is the whole point: only a line whose every unit was paid for by a recorded purchase
    // can be reported as that line's cost. See the note at the write above.
    const rows = await db.query(
        `SELECT order_id, line_uid, cost_cents, units, batches
           FROM cogs_fifo_cost WHERE order_id = ANY($1) AND short_units = 0`,
        [[...new Set(list.map((p) => String(p.orderId)))]]
    ).catch(() => []);
    return new Map(rows.map((r) => [`${r.order_id}|${r.line_uid}`, {
        costCents: Number(r.cost_cents) || 0,
        units: Number(r.units) || 0,
        batches: r.batches || [],
    }]));
}

/** What is left unsold of each batch, oldest first — the honest basis for valuing stock on hand. */
export async function remainingFor(variationId) {
    const batches = (await batchesFor([variationId])).get(String(variationId)) || [];
    const row = await db.queryOne(
        `SELECT COALESCE(SUM(units), 0) AS sold FROM cogs_fifo_cost WHERE variation_id = $1`,
        [String(variationId)]
    ).catch(() => null);
    let skip = Number(row?.sold) || 0;
    const left = [];
    for (const b of batches) {
        const eaten = Math.min(skip, b.units);
        skip -= eaten;
        const rest = b.units - eaten;
        if (rest > 0) left.push({ ...b, units: rest });
    }
    return left;
}
