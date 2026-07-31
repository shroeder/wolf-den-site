import "server-only";

import { db } from "@/lib/db";

// ── SQUARE CASH REFUNDS → THE CASH LEDGER ────────────────────────────────────────────────────────────────────
//
// The cash ledger pulled Square PAYMENTS with source_type CASH and nothing else, so a cash refund — money
// physically handed back over the counter — left the drawer and was never recorded. The ledger then read high
// until somebody counted the till and corrected it, which is exactly what kept happening.
//
// Confirmed on the live account before writing this: three completed cash refunds ($10, $35, $11) existed in
// Square with no matching ledger row, and the only refund row in the whole table was one typed by hand.
//
// This runs SERVER-side on a cron rather than inside the app's sync, because a refund is money that already
// left; whether anyone opened the phone that day shouldn't decide if it gets counted.
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2025-01-23";
const TZ = "America/Chicago";

/** Store-local YYYY-MM-DD for a Square timestamp — the ledger is kept on shop days, not UTC ones. */
function localDay(iso) {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
            .format(new Date(iso));
    } catch {
        return String(iso || "").slice(0, 10);
    }
}

/**
 * Pull completed CASH refunds and write each as a negative cash-ledger row.
 *
 * `lookbackDays` defaults to 30 — comfortably more than the cron interval, so a failed run or a refund that
 * lands late is picked up on the next pass rather than lost. Re-running is free: every row is keyed
 * `square-refund-<id>` and skipped if it already exists.
 */
export async function syncCashRefunds({ lookbackDays = 30, dryRun = false } = {}) {
    // Same source break-even uses — the env token for the single live store.
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return { ok: false, error: "no_square_token" };

    const begin = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const url = `${SQUARE_API}/refunds?begin_time=${encodeURIComponent(begin)}&limit=200&sort_order=DESC`;
    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "Square-Version": SQUARE_VERSION, Accept: "application/json" },
    }).catch(() => null);
    if (!resp?.ok) return { ok: false, error: `square_${resp?.status || "unreachable"}` };

    const data = await resp.json().catch(() => null);
    const refunds = (data?.refunds || []).filter(
        (r) => String(r?.destination_type || "").toUpperCase() === "CASH"
            && String(r?.status || "").toUpperCase() === "COMPLETED"
            && Number(r?.amount_money?.amount || 0) > 0
    );

    // ── DON'T DOUBLE-COUNT WHAT A PHYSICAL COUNT ALREADY SWALLOWED ──────────────────────────────────────────
    //
    // A cash count sets the ledger to what's actually in the drawer, so every unrecorded movement up to that
    // date is ALREADY baked into the balance. Importing a refund from before the last count would subtract it a
    // second time and push the ledger below the till — turning one bug into the opposite bug.
    //
    // This is not just about today's backfill. Counts happen regularly, so the rule has to hold forever: the
    // most recent count is the settled line, and this sync only ever works forward of it.
    const lastCount = await db.queryOne(
        `SELECT MAX(occurred_on) AS d FROM cash_ledger WHERE source = 'reconcile'`
    ).catch(() => null);
    const settledThrough = lastCount?.d ? String(lastCount.d).slice(0, 10) : null;

    let added = 0;
    let skippedSettled = 0;
    const inserted = [];
    for (const r of refunds) {
        const entryId = `square-refund-${r.id}`;
        const amount = -(Number(r.amount_money.amount) / 100); // NEGATIVE — this is cash leaving the drawer
        const day = localDay(r.created_at);
        const desc = `Square cash refund (${String(r.id).slice(-6)})`;
        if (settledThrough && day <= settledThrough) { skippedSettled += 1; continue; }
        if (dryRun) {
            const exists = await db.queryOne(`SELECT 1 AS x FROM cash_ledger WHERE entry_id = $1`, [entryId]).catch(() => null);
            if (!exists) { added += 1; inserted.push({ day, amount, entryId }); }
            continue;
        }
        // NOTE THE PREDICATE. idx_cash_ledger_entry is a PARTIAL unique index (WHERE entry_id IS NOT NULL), and
        // plain `ON CONFLICT (entry_id)` cannot infer a partial index — it raises rather than dedups. Repeating
        // the index's own WHERE clause is what lets Postgres match it.
        const row = await db.queryOne(
            `INSERT INTO cash_ledger (occurred_on, description, amount, payment_method, entry_id, source, created_by)
             VALUES ($1::date, $2, $3, 'Cash On Hand', $4, 'square-refund', 'system')
             ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [day, desc, amount, entryId]
        ).catch(() => null);
        if (row) { added += 1; inserted.push({ day, amount, entryId }); }
    }
    return { ok: true, scanned: refunds.length, added, skippedSettled, settledThrough, inserted };
}
