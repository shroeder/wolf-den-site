import "server-only";

import { db } from "@/lib/db";
import { mergeEntry } from "@/lib/ledger/dupes.js";

// ── CLEANING UP THE DUPLICATES THAT ARE ALREADY IN THE BOOKS ────────────────────────────────────────────────
// Luke: "Lets do it all, I really dont want to manually remediate unless you genuinely cant tell which dupe to
// take, or whether its a dupe."
//
// The live resolver decides from Plaid ids. These rows predate that column, so the only evidence left is the
// SHAPE of the two descriptions — and it turns out to be enough for most of them, because the question is
// almost always "did one side fail to say anything".
//
// ⚠️ THE WHOLE RULE IS WHETHER A DESCRIPTION CARRIES INFORMATION.
//
//   one informative, one not   → the same money written down twice, once by the bank saying nothing useful
//                                and once by a human saying what it was. MERGE, keeping the human's words.
//   both informative           → two things that cost the same. Southern Hobby twice, a Charizard and a bulk
//                                lot both at $50. LEAVE THEM. (Subscriptions are the one exception below.)
//   both uninformative         → two blanks, or an ATM withdrawal beside another ATM withdrawal. Nothing to
//                                reason from. SURFACE IT — this is the "genuinely cant tell" case and it is
//                                the only thing a human should ever be shown.
//
// Measured against the real books that leaves about five pairs needing eyes, out of 105.

/** A bank's way of saying it knows nothing. Extended past the live list: the historical rows are worse. */
const UNINFORMATIVE = new RegExp([
    "^$",
    "^(venmo|check|transfer|withdrawal|debit|ach|zelle|cash\\s*app|payment|purchase|pos)$",
    "^pay\\s*first\\s*check$",
    "^check\\s*check",            // "CHECK CHECK #0", "CHECK CHECK #9999"
    "^automatic\\s*debit",        // "AUTOMATIC DEBIT SQUARE INC PAY"
    "^atm\\s*/?\\s*trans",        // "ATM /TRANS 401 4TH STREET NW"
    "^debit\\s*card\\s*purchase",
].join("|"), "i");

// A subscription does not bill twice in a week; two rows days apart are a pending estimate and its posted
// twin. This is the one case where BOTH sides are informative and it is still one payment.
const SUBSCRIPTION = /vercel|google|namecheap|openai|adobe|spotify|microsoft|anthropic|github|dropbox|godaddy|cloudflare|resend|upsmy|ups\s*my\s*choice/i;

const clean = (s) => String(s || "").trim();
const informative = (s) => !UNINFORMATIVE.test(clean(s).toLowerCase());

/**
 * What to do with one historical pair. Pure, so it can be argued with against the printed list.
 *
 * Returns 'merge' | 'distinct' | 'unsure', and the reason, which is the part worth reading.
 */
export function classifyPair(a, b) {
    const A = clean(a.description);
    const B = clean(b.description);
    const days = Math.abs(Number(a.date_ms) - Number(b.date_ms)) / 86400000;

    // The exception first, or "both informative → distinct" would swallow it.
    if (SUBSCRIPTION.test(A) || SUBSCRIPTION.test(B)) {
        return { verdict: "merge", kind: "backfill_subscription", keep: A.length >= B.length ? "a" : "b",
                 reason: `A subscription billed twice ${Math.round(days)} days apart — a pending row and its posted twin.` };
    }

    const ai = informative(A);
    const bi = informative(B);

    if (ai !== bi) {
        return { verdict: "merge", kind: "backfill_uninformative", keep: ai ? "a" : "b",
                 reason: `One side says nothing (${JSON.stringify(ai ? B : A)}) and the other names the money — the same payment recorded twice.` };
    }
    if (ai && bi) {
        return { verdict: "distinct",
                 reason: "Both sides name something, and they are not the same thing. Two purchases that happened to cost the same." };
    }
    return { verdict: "unsure",
             reason: "Neither side says anything useful, so there is nothing to reason from." };
}

/** Every same-amount pair still in the books, classified. */
export async function planBackfill() {
    const rows = await db.query(
        `SELECT a.entry_id a_id, b.entry_id b_id, a.amount,
                a.description a_desc, b.description b_desc,
                a.category a_cat, b.category b_cat,
                a.payment_method a_pm, b.payment_method b_pm,
                a.date_ms a_date, b.date_ms b_date
           FROM ledger_entry a JOIN ledger_entry b
             ON a.entry_id < b.entry_id
            AND ROUND(a.amount::numeric, 2) = ROUND(b.amount::numeric, 2)
            AND COALESCE(a.payment_method,'') = COALESCE(b.payment_method,'')
            AND ABS(a.date_ms - b.date_ms) <= 4 * 86400000
          WHERE a.type IN ('Expense','Inventory') AND b.type IN ('Expense','Inventory')
          ORDER BY ABS(a.amount) DESC`,
    ).catch(() => []);

    // ⚠️ A ROW MAY ONLY BE SPENT ONCE. The $19.99 UPS charges form SIX pairs across FOUR rows; merging every
    // pair independently would fold a row that had already been folded away, and the second merge would write
    // to an entry_id that no longer means what the plan thought. First claim wins, the rest are skipped.
    const spent = new Set();
    const merge = [], distinct = [], unsure = [], skipped = [];

    for (const r of rows) {
        const c = classifyPair(
            { description: r.a_desc, date_ms: r.a_date },
            { description: r.b_desc, date_ms: r.b_date },
        );
        const item = {
            aId: r.a_id, bId: r.b_id, amount: Math.abs(Number(r.amount) || 0),
            a: { desc: r.a_desc, cat: r.a_cat, date_ms: Number(r.a_date), amount: Number(r.amount), payment_method: r.a_pm },
            b: { desc: r.b_desc, cat: r.b_cat, date_ms: Number(r.b_date), amount: Number(r.amount), payment_method: r.b_pm },
            daysApart: Math.round(Math.abs(Number(r.a_date) - Number(r.b_date)) / 86400000),
            ...c,
        };
        if (c.verdict !== "merge") { (c.verdict === "distinct" ? distinct : unsure).push(item); continue; }
        if (spent.has(r.a_id) || spent.has(r.b_id)) { skipped.push(item); continue; }
        spent.add(r.a_id); spent.add(r.b_id);
        merge.push(item);
    }
    return { merge, distinct, unsure, skipped };
}

/**
 * Carry out the plan.
 *
 * ⚠️ IT MERGES THROUGH mergeEntry — THE SAME FUNCTION THE LIVE RESOLVER USES. Which description survives, and
 * which amount and date win, must be decided in one place; a backfill with its own idea of "more substantive"
 * would be a second definition that drifts from the first the moment either is touched.
 *
 * ⚠️ AND IT DELETES THE LOSER RATHER THAN LEAVING IT. This is the one place in the system that removes a
 * financial row, it runs only on pairs the classifier called 'merge', and every one is written to
 * ledger_merge_log first — including what the deleted row said — so the change is reversible by hand.
 */
export async function runBackfill({ dryRun = true } = {}) {
    const plan = await planBackfill();
    const done = [];

    for (const p of plan.merge) {
        const keepRow = p.keep === "a" ? p.a : p.b;
        const dropRow = p.keep === "a" ? p.b : p.a;
        const keepId = p.keep === "a" ? p.aId : p.bId;
        const dropId = p.keep === "a" ? p.bId : p.aId;

        // The surviving row takes anything the other said better. In practice the loser is the uninformative
        // one and contributes nothing — but a blank CATEGORY beside a real one does get filled this way.
        // ⚠️ THE FIELD NAMES HAVE TO MATCH WHAT mergeEntry READS. The plan carries rows as {desc, cat} and
        // mergeEntry reads {description, category}; handing it the plan's shape made `existing.description`
        // undefined, so pickField saw "nothing vs Venmo" and chose VENMO — keeping the useless name and
        // deleting the typed one. Exactly backwards, on five rows worth $3,427, and completely silent. The
        // dry run is the only reason this was ever seen.
        const { merged, fields } = mergeEntry(
            {
                entry_id: keepId,
                description: keepRow.desc, category: keepRow.cat,
                payment_method: keepRow.payment_method,
                amount: keepRow.amount, date_ms: keepRow.date_ms,
            },
            { description: dropRow.desc, category: dropRow.cat, payment_method: dropRow.payment_method },
        );

        if (!dryRun) {
            await db.query(
                `INSERT INTO ledger_merge_log (kept_entry_id, merged_from, kind, fields) VALUES ($1,$2,$3,$4::jsonb)`,
                [keepId, dropId, p.kind, JSON.stringify({ ...fields, deleted: dropRow, reason: p.reason })],
            );
            await db.query(
                `UPDATE ledger_entry SET description=$2, category=$3, updated_at_ms=$4 WHERE entry_id=$1`,
                [keepId, merged.description ?? keepRow.desc, merged.category ?? keepRow.cat, Date.now()],
            );
            await db.query(`DELETE FROM ledger_entry WHERE entry_id = $1`, [dropId]);
        }
        done.push({ keepId, dropId, amount: p.amount, kept: merged.description ?? keepRow.desc, dropped: dropRow.desc, kind: p.kind });
    }
    return { ...plan, done, dryRun, reclaimed: done.reduce((s, d) => s + d.amount, 0) };
}
