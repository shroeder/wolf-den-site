// ── RE-ATTRIBUTE THE TRADE CASH THE EMPLOYEE BUILD NEVER WROTE ───────────────────────────────────────────────
//
// Until v1.0.588 both cash legs of a trade sat behind `!BuildConfig.IS_EMPLOYEE`, so every trade Eric completed
// moved the drawer and wrote no ledger row. 21 trades, $242.29 out and $19.53 in.
//
// Those movements are ALREADY in the balance -- each physical count set the ledger to the real drawer, which
// swallowed whatever was missing before it. So this is NOT a balance fix. Inserting the rows on their own would
// double-count them and push the ledger below the till.
//
// What it fixes is ATTRIBUTION. Right now the history says "-$117.20 count adjustment, cause unknown" when the
// truth is "three trades paid out $95". Every insert is therefore paired with an equal reduction of the
// correction that absorbed it:
//
//     correction_new = correction_old - (net amount inserted into that window)
//
// which leaves the running balance bit-identical and shrinks each correction to only the part still genuinely
// unexplained. That remainder is the number worth watching from here on.
//
// A count on day D absorbs everything up to AND INCLUDING D, so trades are bucketed by `occurred_on <= count`.
//
// Run with --apply to write. Default is a dry run that prints the plan and touches nothing.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

const balance = async () =>
    Number((await sql`SELECT COALESCE(SUM(amount),0) AS b FROM cash_ledger`)[0].b);

const before = await balance();

// The corrections, oldest first. Each one is a settled line: everything dated at or before it is baked in.
const corrections = await sql`
    SELECT id, occurred_on::text AS d, amount, description
      FROM cash_ledger WHERE source = 'reconcile' ORDER BY occurred_on`;

// Every trade with a cash leg that has no matching ledger row.
const missing = await sql`
    SELECT t.id,
           (t.traded_at AT TIME ZONE 'America/Chicago')::date::text AS d,
           t.cash_total, t.cash_in_total
      FROM trade t
     WHERE (t.cash_total > 0 AND NOT EXISTS (SELECT 1 FROM cash_ledger cl WHERE cl.entry_id = 'trade-cash-' || t.id))
        OR (t.cash_in_total > 0 AND NOT EXISTS (SELECT 1 FROM cash_ledger cl WHERE cl.entry_id = 'trade-cash-in-' || t.id))
     ORDER BY t.traded_at`;

// Build the rows to insert, and tally the net per correction window.
const inserts = [];
for (const t of missing) {
    if (Number(t.cash_total) > 0) {
        inserts.push({
            entryId: `trade-cash-${t.id}`, day: t.d,
            amount: -Number(t.cash_total), desc: `Trade payout (cash) — ${String(t.id).slice(-6)}`,
        });
    }
    if (Number(t.cash_in_total) > 0) {
        inserts.push({
            entryId: `trade-cash-in-${t.id}`, day: t.d,
            amount: Number(t.cash_in_total), desc: `Trade cash collected — ${String(t.id).slice(-6)}`,
        });
    }
}

const windowOf = (day) => corrections.find((c) => day <= c.d) || null;
const net = new Map();
let orphaned = 0;
for (const r of inserts) {
    const w = windowOf(r.day);
    // Dated after the LAST count: nothing has absorbed it yet, so it inserts on its own and the next count will
    // simply find the drawer already matching.
    if (!w) { orphaned += r.amount; continue; }
    net.set(w.id, (net.get(w.id) || 0) + r.amount);
}

console.log(`\n${inserts.length} rows to insert across ${net.size} correction window(s)\n`);
for (const c of corrections) {
    const n = net.get(c.id) || 0;
    if (!n) { console.log(`  ${c.d}  ${money(Number(c.amount)).padStart(10)}  (untouched)`); continue; }
    const next = Number(c.amount) - n;
    const rows = inserts.filter((r) => windowOf(r.day)?.id === c.id);
    console.log(`  ${c.d}  ${money(Number(c.amount)).padStart(10)}  →  ${money(next).padStart(10)}   ` +
        `(${rows.length} trades, net ${money(n)})`);
    for (const r of rows) console.log(`        ${r.day}  ${money(r.amount).padStart(9)}  ${r.desc}`);
}
if (orphaned) console.log(`\n  ${money(orphaned)} falls after the last count — inserted with no offset.`);

if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.\n");
    process.exit(0);
}

for (const r of inserts) {
    // Partial unique index (WHERE entry_id IS NOT NULL) — the predicate has to be repeated or Postgres can't
    // infer the index and raises instead of dedupping.
    await sql`
        INSERT INTO cash_ledger (occurred_on, description, amount, payment_method, entry_id, source, created_by)
        VALUES (${r.day}::date, ${r.desc}, ${r.amount}, 'Cash On Hand', ${r.entryId}, 'trade', 'backfill')
        ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL DO NOTHING`;
}
for (const c of corrections) {
    const n = net.get(c.id) || 0;
    if (!n) continue;
    const next = Number(c.amount) - n;
    await sql`
        UPDATE cash_ledger
           SET amount = ${next},
               description = ${`${c.description} · re-stated: ${money(n)} of it was trade cash`}
         WHERE id = ${c.id}`;
}

const after = await balance();
console.log(`\nbalance before ${money(before)} → after ${money(after)}   drift ${money(after - before)}`);
if (Math.abs(after - before) > 0.005) {
    console.log("!! BALANCE MOVED — this was supposed to be neutral. Investigate before trusting it.");
    process.exit(1);
}
console.log("Balance unchanged, as intended.\n");
