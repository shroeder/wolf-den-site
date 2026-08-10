import "server-only";

import { db } from "@/lib/db";

// One cash-on-hand movement. amount is signed: positive = cash in, negative = cash out.
function mapRow(r) {
    const on = r.occurred_on instanceof Date ? r.occurred_on.toISOString().slice(0, 10) : String(r.occurred_on).slice(0, 10);
    return {
        id: r.id,
        occurredOn: on,
        description: r.description || "",
        amount: Number(r.amount),
        paymentMethod: r.payment_method || null,
        entryId: r.entry_id || null,
        source: r.source,
        createdAt: r.created_at,
        occurredAt: r.occurred_at || null,
        // True when this row's cash was already inside a physical count, so it does not move the balance.
        alreadyCounted: Boolean(r.already_counted),
    };
}

// ── THE BALANCE, IN ONE PLACE ────────────────────────────────────────────────────────────────────────────
// This sum was written out five separate times across four files. It now has to skip rows flagged
// `already_counted` (cash that was physically inside a drawer count before it reached the ledger), and five
// copies of a rule is five chances for one of them to drift. One function, one rule.
export const CASH_BALANCE_SQL =
    `SELECT COALESCE(SUM(amount), 0) AS balance FROM cash_ledger WHERE already_counted = FALSE`;

export async function cashBalance() {
    const rows = await db.query(CASH_BALANCE_SQL).catch(() => null);
    return Math.round(Number(rows?.[0]?.balance ?? 0) * 100) / 100;
}

/**
 * When was the drawer last physically counted? Everything that happened at or before this instant is already
 * inside that count, so a Square sale syncing in afterwards must not move the balance again.
 */
export async function lastCountAt() {
    const row = await db.queryOne(`SELECT MAX(counted_at) AS at FROM cash_count`).catch(() => null);
    return row?.at ? new Date(row.at) : null;
}

export async function listCashLedger({ limit = 2000, offset = 0 } = {}) {
    const rows = await db.query(
        `SELECT * FROM cash_ledger ORDER BY occurred_on DESC, created_at DESC LIMIT $1 OFFSET $2`,
        [Number(limit), Number(offset)],
    );
    return { rows: rows.map(mapRow), balance: await cashBalance() };
}

// RECONCILE cash-on-hand to a physically-counted amount. Audit-safe: instead of overwriting history it
// inserts ONE visible adjustment row for the exact difference (a "cash over/short" true-up), so the trail
// stays intact and the running total lands on the real count. Returns { delta, before, after }.
export async function reconcileCashBalance(target, { occurredOn = null, note = null, createdBy = null } = {}) {
    const tgt = Number(target);
    if (target == null || Number.isNaN(tgt)) throw new Error("A numeric target balance is required.");
    const before = await cashBalance();
    const delta = Math.round((tgt - before) * 100) / 100;
    const on = occurredOn || new Date().toISOString().slice(0, 10);
    if (delta !== 0) {
        const desc = `Cash count adjustment → set to $${tgt.toFixed(2)} (physical count)${note ? ` — ${note}` : ""}`;
        await db.query(
            `INSERT INTO cash_ledger (occurred_on, description, amount, payment_method, entry_id, source, created_by)
             VALUES ($1, $2, $3, 'Cash On Hand', NULL, 'reconcile', $4)`,
            [on, desc, delta, createdBy],
        );
    }
    return { delta, before, after: before + delta };
}

// Upsert a cash movement. When entryId is set, it REPLACES that ledger entry's row (edit-safe — no
// blank leftovers). Rows with no entryId (cash-float / hand-entered) always insert fresh.
export async function upsertCashEntry(input) {
    const {
        entryId = null,
        occurredOn,
        description = "",
        amount,
        paymentMethod = null,
        source = "app",
        createdBy = null,
        // When the money actually moved. A Square cash sale carries the sale's own timestamp; anything
        // hand-entered is happening now. This is what the cutoff below compares against — `occurredOn` is a
        // DATE and cannot tell you which side of a 9pm count a sale fell on.
        occurredAt = null,
    } = input || {};

    if (occurredOn == null || amount == null || Number.isNaN(Number(amount))) {
        throw new Error("occurredOn and a numeric amount are required.");
    }
    const eid = entryId ? String(entryId).trim() : null;
    const at = occurredAt ? new Date(occurredAt) : null;
    const when = at && !Number.isNaN(at.getTime()) ? at : new Date();

    // THE CUTOFF. If this money moved at or before the last physical count, its cash was inside the number
    // somebody counted — the reconcile row for that count already represents it. Adding it to the balance
    // now would count it twice, which is exactly the bug that made a $3.98 overage read as $100.18 missing.
    // The row is still written in full; it just does not move the total.
    const countedAt = await lastCountAt();
    const alreadyCounted = Boolean(countedAt && when <= countedAt);

    if (eid) {
        const rows = await db.query(
            `INSERT INTO cash_ledger (occurred_on, occurred_at, description, amount, payment_method, entry_id, source, created_by, already_counted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL
             DO UPDATE SET occurred_on = EXCLUDED.occurred_on, description = EXCLUDED.description,
                           amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method,
                           source = EXCLUDED.source, updated_at = NOW()
             RETURNING *`,
            [occurredOn, when.toISOString(), description, Number(amount), paymentMethod, eid, source, createdBy, alreadyCounted],
        );
        return mapRow(rows[0]);
    }

    const rows = await db.query(
        `INSERT INTO cash_ledger (occurred_on, occurred_at, description, amount, payment_method, entry_id, source, created_by, already_counted)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8) RETURNING *`,
        [occurredOn, when.toISOString(), description, Number(amount), paymentMethod, source, createdBy, alreadyCounted],
    );
    return mapRow(rows[0]);
}

// Remove the row for a ledger entry (used when an entry is deleted or reclassified out of cash).
export async function deleteCashEntryByEntryId(entryId) {
    const eid = entryId ? String(entryId).trim() : "";
    if (!eid) return 0;
    const rows = await db.query(`DELETE FROM cash_ledger WHERE entry_id = $1 RETURNING id`, [eid]);
    return rows.length;
}

// Remove a single row by its own id (used for hand-entered / no-entry rows shown in the app).
export async function deleteCashRow(id) {
    const rid = id ? String(id).trim() : "";
    if (!rid) return 0;
    const rows = await db.query(`DELETE FROM cash_ledger WHERE id = $1 RETURNING id`, [rid]);
    return rows.length;
}

// One-time cutover: replace the whole table with a verbatim copy of the current sheet rows. This is
// NOT a rebuild-from-ledger (that double-counts) — it copies exactly what the sheet shows today.
export async function replaceAllFromImport(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return db.tx(async (client) => {
        await client.query(`TRUNCATE cash_ledger`);
        let inserted = 0;
        for (const r of list) {
            const amount = Number(r.amount);
            if (Number.isNaN(amount)) continue;
            const occurredOn = r.occurredOn || r.date || null;
            if (!occurredOn) continue;
            const eid = r.entryId ? String(r.entryId).trim() : null;
            // Collapse the sheet's duplicate entry-id rows to one (last wins); null-id float rows all insert.
            await client.query(
                `INSERT INTO cash_ledger (occurred_on, description, amount, payment_method, entry_id, source)
                 VALUES ($1, $2, $3, $4, $5, 'sheets-import')
                 ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL
                 DO UPDATE SET occurred_on = EXCLUDED.occurred_on, description = EXCLUDED.description,
                               amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method`,
                [occurredOn, r.description || "", amount, r.paymentMethod || null, eid],
            );
            inserted += 1;
        }
        return inserted;
    });
}
