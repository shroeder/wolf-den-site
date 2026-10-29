import "server-only";

import { db } from "@/lib/db";

// ── DUPLICATES RESOLVE THEMSELVES ───────────────────────────────────────────────────────────────────────────
// Luke: "the duplicate prevention should be automated not manual intervention", "the whole reason we use dupes
// is to elect to hydrate details from whichever is more substantive", and — the one that collapsed the whole
// design — "if it is truly a dupe than why is it a question."
//
// It was a question because the first cut matched on amount and date, which is guesswork, while Plaid had
// already answered it and the app was discarding the answer. A posted transaction carries
// `pending_transaction_id`: the id of the pending row it replaces. With that parsed there are exactly three
// cases and none of them is uncertain:
//
//   pending link present   → the SAME transaction, settling. Merge.
//   two ids, no link       → two REAL transactions. Leave both. (This is the 63 Southern Hobby "pairs".)
//   no id at all           → a hand entry. The only genuine collision, and decidable by rule.
//
// ⚠️ A MERGE, NOT A REJECTION. The second arrival is usually the BETTER record — the posted row has the
// settled amount and the real merchant name where the pending row said "VENMO". Rejecting it on a constraint
// throws away the improvement. The unique index on external_id stays, because it is what makes two devices
// syncing at once impossible to get wrong, but the write is ON CONFLICT DO UPDATE: the constraint TRIGGERS
// the merge rather than failing it.

/** How far apart a hand entry and its bank row can sit. Measured: the real collisions are 0-1 days. */
const ADOPT_WINDOW_MS = 2 * 86400000;

// Descriptions a bank hands back when it knows nothing. A typed description always beats one of these.
const GENERIC = /^(venmo|check|pay\s*first\s*check|transfer|withdrawal|debit|ach|zelle|cash\s*app|payment|purchase|pos|debit card purchase)$/i;

const clean = (s) => (s == null ? "" : String(s).trim());

/**
 * Which of two values for one field is more substantive.
 *
 * ⚠️ "MORE SUBSTANTIVE" IS NOT "NEWER". The pending row often arrives first with a useless name and the
 * posted row follows with a good one — but a hand-typed "Consignment payout — Andys Cards" beats both, and it
 * is the oldest of the three. Recency is a tiebreak, never the rule, or every automatic merge would quietly
 * overwrite the one description a human bothered to write.
 */
export function pickField(current, incoming, { preferIncoming = false } = {}) {
    const a = clean(current);
    const b = clean(incoming);
    if (!b) return { value: a, changed: false };
    if (!a) return { value: b, changed: true };
    const aGen = GENERIC.test(a);
    const bGen = GENERIC.test(b);
    if (aGen !== bGen) return aGen ? { value: b, changed: true } : { value: a, changed: false };
    // Both meaningful or both generic: the longer one carries more, and ties go to whoever is authoritative
    // for that field (the bank, for money and dates).
    if (b.length > a.length + 2) return { value: b, changed: true };
    if (preferIncoming && b !== a) return { value: b, changed: true };
    return { value: a, changed: false };
}

/**
 * Merge an incoming bank row into an existing entry, field by field.
 *
 * ⚠️ THE BANK WINS ON MONEY AND DATE, THE RICHEST SOURCE WINS ON EVERYTHING ELSE. A posted amount supersedes
 * a pending estimate — that is the entire point of waiting for it — but the bank's idea of a description is
 * "VENMO" and must never replace a real one.
 */
export function mergeEntry(existing, incoming) {
    const fields = {};
    const out = { ...existing };

    const desc = pickField(existing.description, incoming.description);
    if (desc.changed) { out.description = desc.value; fields.description = { from: existing.description, to: desc.value }; }

    const cat = pickField(existing.category, incoming.category);
    if (cat.changed) { out.category = cat.value; fields.category = { from: existing.category, to: cat.value }; }

    const pay = pickField(existing.payment_method, incoming.payment_method);
    if (pay.changed) { out.payment_method = pay.value; fields.payment_method = { from: existing.payment_method, to: pay.value }; }

    // Money and date: the settled figure is the true one.
    if (incoming.amount != null && Number(incoming.amount) !== Number(existing.amount)) {
        out.amount = Number(incoming.amount);
        fields.amount = { from: Number(existing.amount), to: Number(incoming.amount) };
    }
    if (incoming.date_ms != null && Number(incoming.date_ms) !== Number(existing.date_ms)) {
        out.date_ms = Number(incoming.date_ms);
        fields.date_ms = { from: Number(existing.date_ms), to: Number(incoming.date_ms) };
    }
    // The posted id replaces the pending one, and the pending id is kept so the link stays traceable.
    if (incoming.external_id && incoming.external_id !== existing.external_id) {
        out.external_id = incoming.external_id;
        out.external_pending_id = existing.external_id || existing.external_pending_id || null;
        fields.external_id = { from: existing.external_id, to: incoming.external_id };
    }
    return { merged: out, fields };
}

/**
 * Take one bank transaction and put it in the books, exactly once, as richly as possible.
 *
 * Returns { action, entryId } where action is one of:
 *   'inserted'        genuinely new money
 *   'pending_posted'  the settled version of a row we already had
 *   'same_external'   already imported; any better fields folded in
 *   'adopted_manual'  a hand entry for this money already existed and now carries the bank's id
 *
 * ⚠️ NOTHING HERE ASKS ANYTHING, AND NOTHING HERE IS A GUESS. Every branch is decided by an id the source
 * gave us, except the last — and that one fires only against rows carrying NO external id at all, which is
 * to say rows a human typed. A bank row can never adopt another bank row, so two real distributor orders two
 * days apart cannot be collapsed no matter how identical they look.
 */
export async function ingestBankTransaction(tx) {
    const externalId = clean(tx.externalId);
    if (!externalId) return { action: "skipped", reason: "no_external_id" };
    const pendingId = clean(tx.externalPendingId) || null;

    // 1 — Plaid says this posted row replaces a pending one we already hold.
    if (pendingId) {
        const prior = await db.queryOne(
            `SELECT * FROM ledger_entry WHERE external_id = $1`, [pendingId],
        ).catch(() => null);
        if (prior) return applyMerge(prior, tx, externalId, "pending_posted", pendingId);
    }

    // 2 — the same transaction id arriving again. Not an error: a re-sync, a second device, a reinstall.
    const same = await db.queryOne(`SELECT * FROM ledger_entry WHERE external_id = $1`, [externalId]).catch(() => null);
    if (same) return applyMerge(same, tx, externalId, "same_external", null);

    // 3 — an unlinked hand entry for this money. Same amount, same account, within two days, and crucially
    //     NO external id of its own, which is what makes it a typed row rather than another bank row.
    const orphan = await db.queryOne(
        `SELECT * FROM ledger_entry
          WHERE external_id IS NULL
            AND ROUND(amount::numeric, 2) = ROUND($1::numeric, 2)
            AND COALESCE(payment_method,'') = COALESCE($2,'')
            AND ABS(date_ms - $3) <= $4
          ORDER BY ABS(date_ms - $3) ASC
          LIMIT 1`,
        [tx.amount, tx.paymentMethod || null, tx.dateMs, ADOPT_WINDOW_MS],
    ).catch(() => null);
    if (orphan) return applyMerge(orphan, tx, externalId, "adopted_manual", null);

    return { action: "insert_me", reason: "new" };
}

async function applyMerge(existing, tx, externalId, kind, pendingId) {
    const { merged, fields } = mergeEntry(existing, {
        description: tx.description,
        category: tx.category,
        payment_method: tx.paymentMethod,
        amount: tx.amount,
        date_ms: tx.dateMs,
        external_id: externalId,
    });

    await db.query(
        `UPDATE ledger_entry
            SET description = $2, category = $3, payment_method = $4, amount = $5, date_ms = $6,
                external_id = $7, external_pending_id = COALESCE($8, external_pending_id),
                updated_at_ms = $9
          WHERE entry_id = $1`,
        [existing.entry_id, merged.description, merged.category, merged.payment_method,
         merged.amount, merged.date_ms, externalId, pendingId || merged.external_pending_id || null, Date.now()],
    );

    // ⚠️ LOGGED EVEN WHEN NOTHING CHANGED. "This arrived again and improved nothing" is the single most
    // useful line when somebody is asking why a figure moved — the absence of a log entry would be read as
    // the sync not running at all.
    await db.query(
        `INSERT INTO ledger_merge_log (kept_entry_id, merged_from, kind, fields) VALUES ($1, $2, $3, $4::jsonb)`,
        [existing.entry_id, pendingId || externalId, kind, JSON.stringify(fields)],
    ).catch(() => {});

    return { action: kind, entryId: existing.entry_id, changed: Object.keys(fields) };
}

/**
 * What the resolver has been doing lately — the replacement for the review queue.
 *
 * ⚠️ READ-ONLY, AND THAT IS THE WHOLE DIFFERENCE. The queue it replaces asked a question and waited; this
 * reports what already happened. If it is ever wrong the fix is a rule in this file, not a human working
 * through a list of two hundred pairs that will be two hundred and ten tomorrow.
 */
export async function recentMerges({ limit = 100 } = {}) {
    return db.query(
        `SELECT m.id, m.kept_entry_id, m.merged_from, m.kind, m.fields, m.merged_at,
                e.description, e.amount, e.category
           FROM ledger_merge_log m
           LEFT JOIN ledger_entry e ON e.entry_id = m.kept_entry_id
          ORDER BY m.merged_at DESC
          LIMIT $1`,
        [Math.max(1, Math.min(500, limit))],
    ).catch(() => []);
}
