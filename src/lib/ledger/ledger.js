import "server-only";

import { db } from "@/lib/db";

// One ledger entry, shaped to the app's EntryEntity (camelCase, millis timestamps).
function mapRow(r) {
    let receipts = [];
    try {
        receipts = Array.isArray(r.receipt_urls) ? r.receipt_urls : JSON.parse(r.receipt_urls || "[]");
    } catch {
        receipts = [];
    }
    return {
        entryId: r.entry_id,
        date: Number(r.date_ms),
        type: r.type,
        category: r.category || "",
        description: r.description || "",
        amount: Number(r.amount),
        paymentMethod: r.payment_method || "",
        accountType: r.account_type || "",
        reimbursable: !!r.reimbursable,
        pairGroupId: r.pair_group_id || null,
        notes: r.notes ?? null,
        receiptUrls: receipts,
        isRelevantForCashOnHand: !!r.is_relevant_for_cash_on_hand,
        createdAt: Number(r.created_at_ms),
        updatedAt: Number(r.updated_at_ms),
    };
}

export async function listEntries({ limit = 5000, offset = 0 } = {}) {
    const rows = await db.query(
        `SELECT * FROM ledger_entry ORDER BY date_ms DESC, updated_at_ms DESC LIMIT $1 OFFSET $2`,
        [Number(limit), Number(offset)],
    );
    return rows.map(mapRow);
}

function normalize(input) {
    const entryId = String(input?.entryId || "").trim();
    if (!entryId) throw new Error("entryId is required.");
    const date = Number(input.date);
    const amount = Number(input.amount);
    if (!Number.isFinite(date) || !Number.isFinite(amount)) throw new Error("date and amount must be numbers.");
    // Kotlin's JSONObject.optString returns the four-character STRING "null" when the JSON value is null, and
    // String("null" || "") keeps it. 82 bank-synced entries reached the books with description="null" — not
    // empty, not SQL NULL, so every `IS NULL` check reported the data as clean while the ledger showed the
    // word "null" where a payee should be. One of them was a $704 sales-tax payment, which meant Where the
    // Money Is could not see it and reported the tax owed $704 too high.
    //
    // Normalised here rather than in the app so any client — the phone, an import, a future one — is covered.
    const clean = (v) => {
        const t = v == null ? "" : String(v).trim();
        return t === "null" || t === "undefined" ? "" : t;
    };
    return {
        entryId,
        date,
        type: String(input.type || ""),
        category: String(input.category || ""),
        description: clean(input.description),
        amount,
        paymentMethod: input.paymentMethod != null ? String(input.paymentMethod) : null,
        accountType: input.accountType != null ? String(input.accountType) : null,
        reimbursable: !!input.reimbursable,
        pairGroupId: input.pairGroupId ? String(input.pairGroupId) : null,
        notes: input.notes != null ? String(input.notes) : null,
        receiptUrls: JSON.stringify(Array.isArray(input.receiptUrls) ? input.receiptUrls : []),
        isRelevantForCashOnHand: !!input.isRelevantForCashOnHand,
        createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : date,
        updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : date,
    };
}

const UPSERT_SQL = `INSERT INTO ledger_entry
    (entry_id, date_ms, type, category, description, amount, payment_method, account_type, reimbursable,
     pair_group_id, notes, receipt_urls, is_relevant_for_cash_on_hand, created_at_ms, updated_at_ms, source)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
 ON CONFLICT (entry_id) DO UPDATE SET
     date_ms = EXCLUDED.date_ms, type = EXCLUDED.type, category = EXCLUDED.category,
     description = EXCLUDED.description, amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method,
     account_type = EXCLUDED.account_type, reimbursable = EXCLUDED.reimbursable,
     pair_group_id = EXCLUDED.pair_group_id, notes = EXCLUDED.notes, receipt_urls = EXCLUDED.receipt_urls,
     is_relevant_for_cash_on_hand = EXCLUDED.is_relevant_for_cash_on_hand,
     updated_at_ms = EXCLUDED.updated_at_ms`;

function upsertParams(e, source) {
    return [
        e.entryId, e.date, e.type, e.category, e.description, e.amount, e.paymentMethod, e.accountType,
        e.reimbursable, e.pairGroupId, e.notes, e.receiptUrls, e.isRelevantForCashOnHand,
        e.createdAt, e.updatedAt, source,
    ];
}

export async function upsertEntry(input) {
    const e = normalize(input);
    const rows = await db.query(`${UPSERT_SQL} RETURNING *`, upsertParams(e, "app"));
    return mapRow(rows[0]);
}

export async function deleteEntry(entryId) {
    const id = String(entryId || "").trim();
    if (!id) return 0;
    const rows = await db.query(`DELETE FROM ledger_entry WHERE entry_id = $1 RETURNING entry_id`, [id]);
    return rows.length;
}

// One-time cutover: replace the whole table with the current sheet entries (verbatim copy).
export async function replaceAllFromImport(entries) {
    const list = Array.isArray(entries) ? entries : [];
    return db.tx(async (client) => {
        await client.query(`TRUNCATE ledger_entry`);
        let inserted = 0;
        for (const raw of list) {
            let e;
            try {
                e = normalize(raw);
            } catch {
                continue;
            }
            await client.query(UPSERT_SQL, upsertParams(e, "sheets-import"));
            inserted += 1;
        }
        return inserted;
    });
}
