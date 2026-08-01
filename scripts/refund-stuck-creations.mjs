// Refund the creation tokens burned by drafts that never generated anything.
//
// startCustomDeco charges the credit FIRST, then calls buildPrompt / creationActor / genOne. genOne has its own
// try/catch, but the two calls before it do not — so a throw there escaped the function with the token already
// spent, no refund, and the row left at status='drafting', attempts=0, options=[], last_error=null. Neither the
// success path nor the failure path ran.
//
// The member is then shown a draft the UI offers to resume, whose every button fails: nothing to accept, and a
// redraw that throws the same way. Three members, seven drafts, seven paid tokens, zero refunds.
//
// One credit back per stuck draft, and the draft retired so it stops being offered.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const MARK = "stuck-creation-refund-2026-08-01";

// Idempotent: a re-run can't double-refund, because the mark is written into the same ledger this reads.
const already = await sql`
    SELECT DISTINCT buyer_id FROM mkt_creation_ledger WHERE meta->>'mark' = ${MARK}`;
const paid = new Set(already.map((r) => r.buyer_id));

const stuck = await sql`
    SELECT d.id, d.buyer_id, d.name, COALESCE(b.display_name, b.alias) AS who,
           COALESCE(b.custom_deco_credits, 0) AS credits
      FROM mkt_custom_deco d JOIN mkt_buyer b ON b.id = d.buyer_id
     WHERE d.status = 'drafting' AND d.attempts = 0
       AND jsonb_array_length(COALESCE(d.options, '[]'::jsonb)) = 0
     ORDER BY d.buyer_id, d.id`;

const byBuyer = new Map();
for (const r of stuck) {
    if (paid.has(r.buyer_id)) continue;
    const e = byBuyer.get(r.buyer_id) || { who: r.who, credits: Number(r.credits), ids: [] };
    e.ids.push(Number(r.id));
    byBuyer.set(r.buyer_id, e);
}

console.log(`\n${stuck.length} stuck drafts · ${byBuyer.size} members to refund (${paid.size} already done)\n`);
for (const [, e] of byBuyer) {
    console.log(`  ${e.who.padEnd(18)} +${e.ids.length} credits (has ${e.credits} → ${e.credits + e.ids.length})  drafts ${e.ids.join(", ")}`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

for (const [buyerId, e] of byBuyer) {
    const n = e.ids.length;
    const row = await sql`
        UPDATE mkt_buyer SET custom_deco_credits = COALESCE(custom_deco_credits, 0) + ${n}
         WHERE id = ${buyerId} RETURNING COALESCE(custom_deco_credits, 0) AS c`;
    const after = Number(row[0]?.c ?? 0);
    await sql`
        INSERT INTO mkt_creation_ledger (buyer_id, delta, balance_after, source, actor_id, actor_label, meta)
        VALUES (${buyerId}, ${n}, ${after}, 'refund_deco', 'system', 'system',
                ${JSON.stringify({ mark: MARK, reason: "generation never ran", drafts: e.ids })}::jsonb)`;
    // Retire the drafts so the UI stops offering a resume that can't work.
    await sql`
        UPDATE mkt_custom_deco
           SET status = 'failed', last_error = COALESCE(last_error, 'generation never ran — token refunded')
         WHERE id = ANY(${e.ids})`;
    console.log(`refunded ${e.who}: +${n} → ${after}`);
}
console.log(`\nDone — ${byBuyer.size} members, ${[...byBuyer.values()].reduce((s, e) => s + e.ids.length, 0)} credits.\n`);
