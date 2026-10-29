import "server-only";

import { db } from "@/lib/db";

// ── FINDING DUPLICATE LEDGER ENTRIES ─────────────────────────────────────────────────────────────────────────
// Luke: "we need to properly detect dupes in the most adequate way possible."
//
// Two mechanisms, because the books contain two different kinds of duplicate and only one of them can be
// prevented outright:
//
//   EXACT    the same source transaction imported twice. Impossible now — ledger_entry.external_id carries
//            the Plaid id and a partial unique index refuses the second insert, from any device, after any
//            reinstall. That is a database guarantee, not a check somebody has to remember to call.
//
//   NEAR     the same MONEY recorded twice by two different paths, with no shared id to notice it by:
//            pending→posted (Plaid reissues the id when a charge settles), or a hand entry colliding with
//            the bank sync. No id can catch these. This file finds them and ASKS.
//
// ⚠️ IT FLAGS, IT DOES NOT DELETE, AND THAT IS MEASURED RATHER THAN CAUTIOUS. On the real books there are 105
// same-amount pairs within four days; 63 of them are the same vendor — almost all Southern Hobby Distribution,
// the card distributor — 2 to 4 days apart. Those are real repeat orders. An importer confident enough to drop
// them would have eaten about $9,400 of genuine spend to prevent $3,427 of genuine duplication, and the loss
// would have been invisible while the duplication at least shows up as a number that looks wrong.

/** Expenses only. Income duplicating is a different problem with different evidence; this is not it. */
const SPEND_TYPES = ["Expense", "Inventory"];

// How far apart two halves of one payment can land. Pending→posted is usually 1-3 days; four is the widest
// gap observed in the real pairs (Southern Hobby, 09-29 → 10-03). Beyond that the signal is gone and
// everything matches everything.
const WINDOW_DAYS = 4;

// ── HOW SURE WE ARE, AND WHY ─────────────────────────────────────────────────────────────────────────────────
// A confidence the UI can sort on and a reason a human can check. The reason matters more than the score: "a
// Venmo debit for exactly a consignment payout" is an argument, and "0.9" is not.
const GENERIC = /^(venmo|check|pay\s*first\s*check|transfer|withdrawal|debit|ach|zelle|cash\s*app|payment|purchase)$/i;
const SUBSCRIPTION = /vercel|google|namecheap|openai|adobe|spotify|microsoft|anthropic|github|dropbox|godaddy|cloudflare/i;

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Judge one candidate pair. Pure — no database, no clock — so it can be tested against the real pairs and
 * argued with directly.
 */
export function judgePair(a, b) {
    const A = norm(a.description);
    const B = norm(b.description);
    const days = Math.abs(Number(a.date_ms) - Number(b.date_ms)) / 86400000;

    // ⚠️ THE BANK'S GENERIC ROW BESIDE A NAMED ONE IS THE STRONGEST SIGNAL IN THE BOOKS. "Venmo" for exactly
    // the amount of "Consignment payout — Andys Cards", a day apart, is one payment written down twice: once
    // by the sync, once by hand. Every one of the five real duplicates found in the audit has this shape.
    const aGen = GENERIC.test(A);
    const bGen = GENERIC.test(B);
    if (aGen !== bGen && A && B) {
        return { confidence: 0.92, reason: "A generic bank row beside a named entry for the same amount — the same payment recorded twice." };
    }

    // A subscription does not bill twice in a week. This is pending→posted almost by definition.
    if (SUBSCRIPTION.test(A) || SUBSCRIPTION.test(B)) {
        return { confidence: 0.85, reason: "A subscription charged twice days apart — a pending row and its posted twin." };
    }

    // Same vendor, same amount, days apart. This is the ambiguous mass, and the honest answer is that we do
    // not know: a distributor order really can repeat. Same DAY is a little more suspicious than three days.
    const sameVendor = A && B && (A.slice(0, 14) === B.slice(0, 14));
    if (sameVendor) {
        return {
            confidence: days < 1 ? 0.45 : 0.25,
            reason: days < 1
                ? "The same vendor twice on one day for the same amount — possible, but worth a look."
                : "The same vendor a few days apart. Repeat orders look exactly like this; probably real.",
        };
    }

    return { confidence: 0.3, reason: "Same amount and payment method within a few days, with nothing else in common." };
}

/**
 * Every unjudged near-match in the books, strongest first.
 *
 * ⚠️ PAIRS ALREADY DECIDED ARE EXCLUDED IN SQL, not filtered afterwards. A reviewer who has said "these are
 * two different orders" must never be shown that pair again — being asked the same question repeatedly is how
 * a review queue becomes something people dismiss without reading.
 */
export async function findNearDuplicates({ limit = 200 } = {}) {
    const rows = await db.query(
        `SELECT a.entry_id AS a_id, b.entry_id AS b_id,
                a.amount, a.payment_method,
                a.description AS a_desc, b.description AS b_desc,
                a.category AS a_cat, b.category AS b_cat,
                a.date_ms AS a_date, b.date_ms AS b_date,
                a.source AS a_src, b.source AS b_src
           FROM ledger_entry a
           JOIN ledger_entry b
             ON a.entry_id < b.entry_id
            AND ROUND(a.amount::numeric, 2) = ROUND(b.amount::numeric, 2)
            AND COALESCE(a.payment_method, '') = COALESCE(b.payment_method, '')
            AND ABS(a.date_ms - b.date_ms) <= $1
          WHERE a.type = ANY($2) AND b.type = ANY($2)
            AND NOT EXISTS (
                SELECT 1 FROM ledger_dupe_verdict v
                 WHERE v.lo_entry_id = LEAST(a.entry_id, b.entry_id)
                   AND v.hi_entry_id = GREATEST(a.entry_id, b.entry_id)
            )
          LIMIT $3`,
        [WINDOW_DAYS * 86400000, SPEND_TYPES, Math.max(1, Math.min(1000, limit))],
    ).catch(() => []);

    return (rows || [])
        .map((r) => {
            const { confidence, reason } = judgePair(
                { description: r.a_desc, date_ms: r.a_date },
                { description: r.b_desc, date_ms: r.b_date },
            );
            return {
                aId: r.a_id, bId: r.b_id,
                amount: Math.abs(Number(r.amount) || 0),
                paymentMethod: r.payment_method || null,
                a: { desc: r.a_desc, cat: r.a_cat, at: Number(r.a_date), source: r.a_src },
                b: { desc: r.b_desc, cat: r.b_cat, at: Number(r.b_date), source: r.b_src },
                daysApart: Math.round(Math.abs(Number(r.a_date) - Number(r.b_date)) / 86400000),
                confidence, reason,
            };
        })
        // Strongest first, and within that the most money — a reviewer's attention is finite and should be
        // spent where both the doubt and the dollars are largest.
        .sort((x, y) => (y.confidence - x.confidence) || (y.amount - x.amount));
}

/**
 * Record a decision about one pair so it is never asked again.
 *
 * ⚠️ IT DOES NOT DELETE ANYTHING, even for 'duplicate'. Recording the judgement and removing a financial row
 * are two different acts with two different blast radii, and bundling them means a mis-tap on a review screen
 * silently alters the books. The verdict is the durable thing; the deletion is a separate, deliberate step.
 */
export async function recordVerdict(aId, bId, verdict, { by = null, note = null } = {}) {
    const x = String(aId || "").trim();
    const y = String(bId || "").trim();
    if (!x || !y || x === y) return { ok: false, error: "bad_pair" };
    if (!["duplicate", "distinct"].includes(verdict)) return { ok: false, error: "bad_verdict" };
    // The table's CHECK enforces lo < hi; ordering here is what makes the lookup in findNearDuplicates hit.
    const lo = x < y ? x : y;
    const hi = x < y ? y : x;
    await db.query(
        `INSERT INTO ledger_dupe_verdict (lo_entry_id, hi_entry_id, verdict, decided_by, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (lo_entry_id, hi_entry_id)
         DO UPDATE SET verdict = EXCLUDED.verdict, decided_by = EXCLUDED.decided_by,
                       note = EXCLUDED.note, decided_at = NOW()`,
        [lo, hi, verdict, by, note],
    );
    return { ok: true, lo, hi, verdict };
}

/**
 * Does this external transaction already exist in the books?
 *
 * The import should call this before building a row — but it is belt to the unique index's braces, not a
 * replacement for it. Two devices syncing at the same moment both get "no" from this and only one of them
 * gets past the index, which is the whole reason the guarantee lives in the schema.
 */
export async function alreadyImported(externalId) {
    const id = String(externalId || "").trim();
    if (!id) return false;
    const row = await db.queryOne(`SELECT 1 AS x FROM ledger_entry WHERE external_id = $1`, [id]).catch(() => null);
    return Boolean(row);
}
