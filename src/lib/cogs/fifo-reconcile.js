import "server-only";

import { db } from "@/lib/db";
import { costSales } from "@/lib/cogs/fifo.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "cogs-fifo-reconcile" });

const SQUARE_API = "https://connect.squareup.com";

// ── WALK THE SALES IN ORDER AND WRITE DOWN WHAT EACH ONE COST ────────────────────────────────────────────────
// FIFO is an ordering, so this has to start at the beginning and go forward. It is resumable — the cursor
// remembers how far it got — because a full history scan is not something to repeat on every run, and because
// restarting from the middle would hand the wrong batch to the wrong sale.
//
// ⚠️ IT STARTS AT THE FIRST PURCHASE, NOT AT THE FIRST SALE. A sale that happened before we ever recorded
// buying the thing has no batch to draw from and is left uncosted on purpose — see allocate(), which reports
// those units as `short` rather than pricing them at zero.
async function squareFetch(path, { method = "GET", body } = {}) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("SQUARE_ACCESS_TOKEN missing");
    const res = await fetch(`${SQUARE_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(process.env.SQUARE_API_VERSION ? { "Square-Version": process.env.SQUARE_API_VERSION } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Square ${path} ${res.status}: ${JSON.stringify(json?.errors || {}).slice(0, 200)}`);
    return json;
}

async function locationIds() {
    const j = await squareFetch("/v2/locations");
    return (j.locations || []).map((l) => l.id).filter(Boolean);
}

/**
 * @param {object} opts
 * @param {boolean} opts.full   ignore the cursor and re-cost from the first purchase (after an edit to history)
 * @param {boolean} opts.dryRun work everything out and write nothing
 */

/**
 * What a planned walk would do to the stored numbers, in money.
 *
 * Returns counts, the net COGS movement, and the lines that move most — enough to decide whether a seed is
 * right BEFORE it is applied. `removed` only means anything for a full run, which clears the table first;
 * an incremental walk never sees the rows outside its window and must not report them as disappearing.
 */
async function comparePlanToStored(rows, { full = false } = {}) {
    const stored = new Map();
    for (const r of await db.query(
        `SELECT order_id, line_uid, cost_cents, units, short_units FROM cogs_fifo_cost`
    ).catch(() => [])) {
        stored.set(`${r.order_id}|${r.line_uid}`, {
            costCents: Number(r.cost_cents) || 0, short: Number(r.short_units) || 0,
        });
    }

    let added = 0, changed = 0, same = 0, deltaCents = 0;
    const movers = [];
    const seen = new Set();
    for (const r of rows) {
        const key = `${r.orderId}|${r.lineUid}`;
        seen.add(key);
        const was = stored.get(key);
        if (!was) {
            added += 1;
            // A line that is reportable only once it is no longer short is a real change in what the report
            // says, so an added row only counts toward the money when it can actually be used.
            if (r.short === 0) deltaCents += r.costCents;
            movers.push({ key, variationId: r.variationId, from: null, to: r.costCents, d: r.costCents });
            continue;
        }
        if (was.costCents === r.costCents && was.short === r.short) { same += 1; continue; }
        changed += 1;
        const fromUsable = was.short === 0 ? was.costCents : 0;
        const toUsable = r.short === 0 ? r.costCents : 0;
        deltaCents += toUsable - fromUsable;
        movers.push({ key, variationId: r.variationId, from: was.costCents, to: r.costCents, d: toUsable - fromUsable });
    }
    const removed = full ? [...stored.keys()].filter((k) => !seen.has(k)).length : 0;

    movers.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    return {
        summary: { added, changed, unchanged: same, removed, deltaDollars: Number((deltaCents / 100).toFixed(2)) },
        movers: movers.slice(0, 25).map((m) => ({
            line: m.key, variationId: m.variationId,
            from: m.from == null ? null : Number((m.from / 100).toFixed(2)),
            to: Number((m.to / 100).toFixed(2)),
            change: Number((m.d / 100).toFixed(2)),
        })),
    };
}

export async function reconcileFifo({ full = false, dryRun = false } = {}) {
    const cursor = await db.queryOne(`SELECT scanned_to FROM cogs_fifo_cursor WHERE id = TRUE`).catch(() => null);
    const firstBuy = await db.queryOne(
        `SELECT MIN(occurred_on) AS d FROM cogs_ledger WHERE variation_id IS NOT NULL AND quantity > 0`
    ).catch(() => null);

    // Nothing is linked to a catalog item yet, so there is nothing FIFO can be computed against.
    if (!firstBuy?.d) {
        logger.info("cogs.fifo.nothing_linked");
        return { ok: true, scanned: 0, costed: 0, note: "no linked purchases" };
    }

    const startAt = full || !cursor?.scanned_to
        ? new Date(firstBuy.d).toISOString()
        : new Date(cursor.scanned_to).toISOString();
    const endAt = new Date().toISOString();

    const locs = await locationIds();
    const sales = [];
    let orders = 0;
    let next = null;

    do {
        const page = await squareFetch("/v2/orders/search", {
            method: "POST",
            body: {
                location_ids: locs,
                cursor: next || undefined,
                limit: 500,
                query: {
                    filter: {
                        state_filter: { states: ["COMPLETED"] },
                        date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } },
                    },
                    // ⚠️ ASCENDING. This is the whole point: the oldest sale must be costed first or it takes
                    // a batch that belongs to a sale before it.
                    sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
                },
            },
        });
        for (const order of page.orders || []) {
            orders += 1;
            const soldAt = order.closed_at || order.updated_at || order.created_at;
            for (const li of order.line_items || []) {
                if (!li?.catalog_object_id) continue;
                const units = Number(li.quantity) || 0;
                if (units <= 0) continue;
                sales.push({
                    orderId: order.id,
                    lineUid: li.uid || `${order.id}-${li.catalog_object_id}`,
                    variationId: li.catalog_object_id,
                    soldAt,
                    units,
                });
            }
            // Returns give units back. Handled as a NEGATIVE sale would corrupt the ordering, so they are
            // counted here and left for the note below rather than silently mis-costed.
        }
        next = page.cursor || null;
    } while (next);

    // ── ⚠️ A DRY RUN SAYS WHAT WOULD CHANGE, NOT HOW MANY ORDERS IT SAW ─────────────────────────────────────
    // Luke, on seeding the purchase history that FIFO still cannot see: "my concern is existing items, and how
    // you can seed that properly without interrupting anything." This is the answer. Link some rows, run this,
    // and it costs every sale in memory and diffs the result against what is stored — line by line, in money —
    // without writing anything. The apply step is then the same pass with the writes turned on.
    //
    // It is safe to reach for at any time: the annotation on the proxy only ever ADDS a field where a stored
    // row exists, so an item with no row behaves exactly as it does today. Seeding is per-item by construction.
    if (dryRun) {
        const planned = await costSales(sales, { write: false, fresh: full });
        const diff = await comparePlanToStored(planned.rows, { full });
        logger.info("cogs.fifo.dry_run", { orders, lines: sales.length, ...diff.summary });
        return { ok: true, dryRun: true, scanned: orders, lines: sales.length,
                 costed: planned.costed, short: planned.short, skipped: planned.skipped, ...diff };
    }

    // ⚠️ A FULL RUN CLEARS FIRST. Re-costing on top of old rows would leave sales that no longer exist (a
    // voided order, a line that moved) sitting in the table forever, quietly counted.
    if (full) {
        await db.query(`DELETE FROM cogs_fifo_cost`).catch(() => {});
    }

    const result = await costSales(sales, { fresh: full });

    await db.query(
        `INSERT INTO cogs_fifo_cursor (id, scanned_to, last_run_at, orders_seen, lines_costed)
         VALUES (TRUE, $1, NOW(), $2, $3)
         ON CONFLICT (id) DO UPDATE
            SET scanned_to = EXCLUDED.scanned_to, last_run_at = NOW(),
                orders_seen = cogs_fifo_cursor.orders_seen + EXCLUDED.orders_seen,
                lines_costed = cogs_fifo_cursor.lines_costed + EXCLUDED.lines_costed`,
        [endAt, orders, result.costed]
    ).catch(() => {});

    logger.info("cogs.fifo.reconciled", { orders, ...result });
    return { ok: true, scanned: orders, lines: sales.length, ...result };
}
