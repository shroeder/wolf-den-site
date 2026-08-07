// ── UNDO THE DOUBLE-BOOKED $1,400 OF 2026-08-06 ──────────────────────────────────────────────────────────────
// A withdrawal was entered through the AI ledger as "I withdrew 1400 from business checking that is now cash on
// hand", with the note "for consigner and pokemon". The interpreter read the note as a second transaction and
// wrote a PAIR: +$1,400 in (correct) and −$1,400 out described "Pokemon Sealed Cards And Consigner Payments".
//
// But those payments were then recorded individually as they actually happened — a $283 restock, a $457.62
// consignment payout, a $360 restock — so the same money left the drawer twice. The end-of-night count found
// the drawer $1,261.33 richer than the books and a reconcile entry plugged the gap, which hid the cause.
//
// This removes the phantom outflow and restates the count so the audit trail says what really happened: the
// true unexplained variance for the day was small, not twelve hundred dollars.
//
// The final BALANCE does not move — it was and remains the physically counted $1,290.00. Only the story does.
//
//   node scripts/fix-cash-double-count.mjs            (dry run)
//   node scripts/fix-cash-double-count.mjs --apply
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);

const PHANTOM_ID = "dc1a6058-34c9-478f-8175-b2f81614b44d"; // the −$1,400 "Pokemon Sealed Cards And Consigner Payments"
const COUNT_ID = 4;                                        // the 2026-08-06 clock-out count

const money = (n) => `$${Number(n).toFixed(2)}`;

const before = Number((await sql`SELECT COALESCE(SUM(amount), 0) AS t FROM cash_ledger`)[0].t);
const phantom = await sql`SELECT * FROM cash_ledger WHERE id = ${PHANTOM_ID}`;
const count = await sql`SELECT * FROM cash_count WHERE id = ${COUNT_ID}`;
if (!phantom.length) { console.log("The phantom row is already gone — nothing to do."); process.exit(0); }
if (!count.length) { console.error("Count #4 not found; refusing to guess."); process.exit(1); }

const c = count[0];
const oldExpected = Number(c.expected_amount);
const actual = Number(c.actual_amount);
const oldDelta = Number(c.delta);
// Removing a $1,400 outflow raises what the books expected by exactly that much.
const newExpected = oldExpected + 1400;
const newDelta = Number((actual - newExpected).toFixed(2));
// The reconcile row has to shrink by the same $1,400, so the ledger still lands on the counted amount.
const adj = await sql`SELECT * FROM cash_ledger WHERE source = 'reconcile' AND occurred_on >= '2026-08-06' ORDER BY created_at DESC LIMIT 1`;
if (!adj.length) { console.error("No reconcile row found for that day; refusing to guess."); process.exit(1); }
const oldAdj = Number(adj[0].amount);
const newAdj = Number((oldAdj - 1400).toFixed(2));

console.log("cash_ledger balance now:        ", money(before));
console.log("");
console.log("REMOVE  the phantom outflow:    ", money(phantom[0].amount), "—", phantom[0].description);
console.log("RESTATE the reconcile entry:    ", money(oldAdj), "→", money(newAdj));
console.log("RESTATE count #4 expected:      ", money(oldExpected), "→", money(newExpected));
console.log("RESTATE count #4 variance:      ", money(oldDelta), "→", money(newDelta));
console.log("");
console.log("balance after (must be unchanged):", money(before + 1400 + (newAdj - oldAdj)));
console.log("physically counted that night:    ", money(actual));

if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to write."); process.exit(0); }

await sql`DELETE FROM cash_ledger WHERE id = ${PHANTOM_ID}`;
await sql`UPDATE cash_ledger SET amount = ${newAdj},
                 description = ${`Cash count adjustment → set to ${money(actual)} (physical count)`}
           WHERE id = ${adj[0].id}`;
await sql`UPDATE cash_count SET expected_amount = ${newExpected}, delta = ${newDelta},
                 note = ${"Restated: a $1,400 paired outflow (\"Pokemon Sealed Cards And Consigner Payments\") double-counted purchases that were also recorded individually. Removing it puts the true variance at " + money(newDelta) + "."}
           WHERE id = ${COUNT_ID}`;

const after = Number((await sql`SELECT COALESCE(SUM(amount), 0) AS t FROM cash_ledger`)[0].t);
console.log("\nDone. cash_ledger balance is now", money(after), after.toFixed(2) === actual.toFixed(2) ? "— matches the physical count." : "— CHECK THIS.");
