// Revoke creation tokens that no payment or grant can account for.
//
// Every other holder reconciles exactly against a real payment:
//   Sunflower Jinxx  $25.00 Square (receipt on file)  20 bought - 14 spent = 6 held
//   Eric D           $5.00 Square + $25.00 store credit, every token has a ledger row
//   The Wolf Den     $25.00 Square (receipt on file), owner account
//
// JT does not. Their FIRST EVER ledger row is a spend with balance_after 19, so 20 tokens already existed
// before the ledger began — and there is no row in mkt_creation_purchase, no grant, no store-credit entry and
// no Square payment anywhere. The creation ledger's first row is 07-27 13:07 and the first real purchase was
// 07-25 14:38, so anything granted in that window left no trace by design.
//
// At $25 for 20 tokens these are worth about $23.75, which is why they don't just get left alone.
//
// WHAT IS DELIBERATELY NOT TOUCHED: the decoration JT already made. It cost us real OpenAI spend, they have it
// on their farm, and clawing back a finished thing punishes them for our missing bookkeeping. Only the unspent
// balance goes. The revocation is written to the ledger so it is auditable and reversible.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const sql = neon(readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim());
const MARK = "unexplained-creation-revoke-2026-08-01";

const already = await sql`SELECT DISTINCT buyer_id FROM mkt_creation_ledger WHERE meta->>'mark' = ${MARK}`;
const done = new Set(already.map((r) => r.buyer_id));

// Reconcile every holder rather than hard-coding a name: held vs (paid for OR granted) minus spent.
const rows = await sql`
    SELECT b.id, COALESCE(b.display_name, b.alias) AS who, COALESCE(b.custom_deco_credits, 0)::int AS held,
           COALESCE((SELECT SUM(tokens) FROM mkt_creation_purchase p WHERE p.buyer_id = b.id AND p.status = 'paid'), 0)::int AS bought,
           COALESCE((SELECT SUM(amount_cents) FROM mkt_creation_purchase p WHERE p.buyer_id = b.id AND p.status = 'paid'), 0)::int AS cents,
           COALESCE((SELECT SUM(delta) FROM mkt_creation_ledger l WHERE l.buyer_id = b.id AND l.delta > 0), 0)::int AS led_in,
           COALESCE((SELECT -SUM(delta) FROM mkt_creation_ledger l WHERE l.buyer_id = b.id AND l.delta < 0), 0)::int AS led_out
      FROM mkt_buyer b
     WHERE COALESCE(b.custom_deco_credits, 0) > 0
     ORDER BY 3 DESC`;

const plan = [];
for (const r of rows) {
    if (done.has(r.id)) continue;
    // A purchase the ledger ALSO recorded must not count twice, so take the larger of the two, not the sum.
    const accounted = Math.max(Number(r.bought), Number(r.led_in));
    const expected = accounted - Number(r.led_out);
    const gap = Number(r.held) - expected;
    if (gap > 0) plan.push({ ...r, expected, gap, revokeTo: Math.max(0, Number(r.held) - gap) });
}

console.log(`\n${rows.length} holders checked · ${plan.length} with credits nothing accounts for\n`);
for (const r of rows) {
    const p = plan.find((x) => x.id === r.id);
    const tag = p ? `  ⚠ ${p.gap} unexplained → set to ${p.revokeTo}` : "  ok";
    console.log(`  ${String(r.who).padEnd(18)} holds ${String(r.held).padStart(3)}  paid $${(r.cents / 100).toFixed(2).padStart(6)}  bought ${String(r.bought).padStart(2)}  ledger+${String(r.led_in).padStart(2)} -${String(r.led_out).padStart(2)}${tag}`);
}

if (!plan.length) { console.log("\nnothing to revoke.\n"); process.exit(0); }
if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

for (const r of plan) {
    const after = await sql`
        UPDATE mkt_buyer SET custom_deco_credits = ${r.revokeTo} WHERE id = ${r.id}
        RETURNING COALESCE(custom_deco_credits, 0) AS c`;
    await sql`
        INSERT INTO mkt_creation_ledger (buyer_id, delta, balance_after, source, actor_id, actor_label, meta)
        VALUES (${r.id}, ${-r.gap}, ${Number(after[0]?.c ?? 0)}, 'revoke_unaccounted', 'system', 'system',
                ${JSON.stringify({ mark: MARK, heldBefore: r.held, expected: r.expected, paidCents: r.cents, reason: "no purchase, grant or store-credit record accounts for these tokens" })}::jsonb)`;
    console.log(`revoked ${r.gap} from ${r.who} → ${after[0]?.c}`);
}
console.log(`\nDone — ${plan.length} member(s), ${plan.reduce((s, r) => s + r.gap, 0)} tokens revoked.\n`);
