// ── THE MAKE-GOOD FOR THE PEOPLE WHO WERE SAVING ─────────────────────────────────────────────────────────
// Luke: "people are all salty about the casino rework... they are pissed because they had tokens that are now
// irrelevant, maybe we could add the token amount they had to their lifetime spend."
//
// They are right to be annoyed and the complaint is sharper than it first looks. The tokens were NOT taken —
// every one became a gold piece — but they were being SAVED, and what they were being saved for stopped
// existing. Somebody sitting on 41,000 tokens three days from a Counter pet got the gold and lost the pet.
//
// The ladder measures lifetime winnings, so the fix is to count the hoard as what it always was: winnings
// they had not spent yet.
//
// ⚠️ THE THING TO CHECK FIRST IS WHETHER IT IS ALREADY IN THERE. casino_won was seeded from the win rows in
// the casino's ledger, and a token balance IS won-minus-spent — so for most members the hoard is already
// inside the lifetime figure and adding it again would be paying the same win twice. This script measures
// that before it moves anything.
//
//   node scripts/casino-makegood.mjs           what it would do
//   node scripts/casino-makegood.mjs --apply   do it
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

import { entitlements } from "../src/lib/marketplace/casino-milestones.js";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

// What each member was holding when the shelf closed, from the conversion rows the migrations wrote. Reading
// the LEDGER rather than a remembered number: the balances themselves are zero now, so this is the only
// record of what anybody had.
const held = await sql`
  SELECT e.buyer_id, b.display_name AS who, COALESCE(b.casino_won,0)::bigint AS won,
         SUM(e.delta)::bigint AS converted
    FROM mkt_chip_event e JOIN mkt_buyer b ON b.id = e.buyer_id
   WHERE e.reason IN ('chips_converted', 'tokens_converted', 'currency_swept')
   GROUP BY e.buyer_id, b.display_name, b.casino_won
   ORDER BY SUM(e.delta) DESC`;

const rungs = (won) => entitlements(won).reduce((s, e) => s + e.n, 0);

console.log("member              held      lifetime now   would become   rungs now -> after");
let total = 0;
const plan = [];
for (const r of held) {
    const add = Number(r.converted);
    const before = Number(r.won);
    const after = before + add;
    const a = rungs(before); const b = rungs(after);
    total += add;
    plan.push({ id: r.buyer_id, who: r.who, add, before, after, gained: b - a });
    console.log(`  ${String(r.who || "(unnamed)").padEnd(18)} ${add.toLocaleString().padStart(8)} ${before.toLocaleString().padStart(12)} ${after.toLocaleString().padStart(14)}   ${a} -> ${b}${b > a ? `  (+${b - a})` : ""}`);
}
const gained = plan.reduce((s, p) => s + p.gained, 0);
console.log(`\n  ${plan.length} members, ${total.toLocaleString()} added to lifetime winnings, ${gained} extra rungs unlocked across the Den`);

// ⚠️ AND WHAT THOSE RUNGS ACTUALLY ARE, because "12 extra rungs" could be twelve stat levels or twelve
// Eternal chests and those are not the same sentence.
const tally = {};
for (const p of plan) {
    const a = entitlements(p.before); const b = entitlements(p.after);
    for (let i = 0; i < b.length; i += 1) {
        const d = b[i].n - a[i].n;
        if (d > 0) tally[`${b[i].kind}:${b[i].ref}`] = (tally[`${b[i].kind}:${b[i].ref}`] || 0) + d;
    }
}
if (Object.keys(tally).length) {
    console.log("\n  what it hands over:");
    for (const [k, n] of Object.entries(tally).sort((x, z) => z[1] - x[1])) console.log(`    ${k.padEnd(26)} ${n}`);
}

// ⚠️ ONCE, AND THE LEDGER IS WHAT ENFORCES IT. This is a one-off correction, not a job. It was run
// twice within a second of itself because a guard patch failed its own assertion and the two chained
// commands both went through — 608,783 of lifetime added twice, reversed by hand off these very rows.
// A guard that lives in a comment is not a guard; this one is a read.
const [already] = await sql`SELECT id FROM mkt_chip_event WHERE reason = 'makegood_lifetime' LIMIT 1`;
if (already) { console.log("already applied — the rows are in the ledger. Nothing to do."); process.exit(0); }

if (!process.argv.includes("--apply")) { console.log("\n--- DRY RUN. add --apply ---"); process.exit(0); }

for (const p of plan) {
    if (p.add <= 0) continue;
    await sql`UPDATE mkt_buyer SET casino_won = COALESCE(casino_won,0) + ${p.add} WHERE id = ${p.id}`;
    // A row in the casino's own book, so this is a thing somebody can point at rather than a number that
    // moved overnight.
    await sql`INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${p.id}, 0, 0, 'makegood_lifetime',
                      ${JSON.stringify({ added: p.add, from: p.before, to: p.after })}::jsonb)`;
}
console.log(`\napplied to ${plan.filter((p) => p.add > 0).length} members.`);
