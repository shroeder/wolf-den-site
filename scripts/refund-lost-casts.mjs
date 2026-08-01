// Give back the fishing casts burned while reeling in was broken.
//
// landFish referenced `seaPets`, declared in castLine — a different function. Every reel-in threw a
// ReferenceError. The cast is spent in castLine, so the sequence was: cast consumed, fish hooked, reel throws,
// nothing awarded. Broken from 04:08 to 12:19 on 2026-08-01, about eight hours.
//
// A lost cast is one with NO recorded outcome: fish_caught, fish_missed and fish_treasure all log an activity
// event, and a throw logs none. So `casts spent today − outcomes today` is the count, and a genuine miss (which
// does log) is correctly not refunded.
//
// Refunded by DECREMENTING fish_casts, which is the same counter the daily allowance is measured against — so
// the member simply gets their casts back to spend today.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const MARK = "lost-casts-refund-2026-08-01";

const already = await sql`
    SELECT DISTINCT buyer_id FROM mkt_activity_event WHERE event = 'cast_makegood' AND meta->>'mark' = ${MARK}`;
const paid = new Set(already.map((r) => r.buyer_id));

const rows = await sql`
    SELECT COALESCE(b.display_name, b.alias) AS who, b.id,
           COALESCE(s.fish_casts, 0) AS casts,
           (SELECT COUNT(*)::int FROM mkt_activity_event e
             WHERE e.buyer_id = b.id
               AND e.event IN ('fish_caught', 'fish_missed', 'fish_treasure')
               AND (e.created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
           ) AS outcomes
      FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id
     WHERE s.fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
       AND COALESCE(s.fish_casts, 0) > 0
     ORDER BY 3 DESC`;

const plan = rows
    .map((r) => ({ ...r, lost: Math.max(0, Number(r.casts) - Number(r.outcomes)) }))
    .filter((r) => r.lost > 0 && !paid.has(r.id));

console.log(`\n${plan.length} members owed casts (${paid.size} already refunded)\n`);
for (const r of plan) {
    console.log(`  ${(r.who || r.id).padEnd(18)} ${r.casts} spent, ${r.outcomes} outcomes → +${r.lost} back`);
}
console.log(`\ntotal: ${plan.reduce((s, r) => s + r.lost, 0)} casts`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

for (const r of plan) {
    await sql`
        UPDATE mkt_sailing SET fish_casts = GREATEST(0, COALESCE(fish_casts, 0) - ${r.lost})
         WHERE buyer_id = ${r.id} AND fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date`;
    await sql`
        INSERT INTO mkt_activity_event (buyer_id, event, meta)
        VALUES (${r.id}, 'cast_makegood', ${JSON.stringify({ mark: MARK, casts: r.lost, reason: "reel-in threw for ~8h" })}::jsonb)`;
    console.log(`refunded ${r.who}: +${r.lost}`);
}
console.log(`\nDone — ${plan.length} members, ${plan.reduce((s, r) => s + r.lost, 0)} casts returned.\n`);
