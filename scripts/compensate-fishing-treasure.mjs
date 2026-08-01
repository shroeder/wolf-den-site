// Make good the fishing treasures that paid out nothing.
//
// haulSprite was called and never defined, so grantHaul threw, the caller's .catch(() => null) swallowed it,
// and every treasure haul between 2026-07-31 01:52 and the fix reported TREASURE with no prize. 34 hauls across
// 12 members, all logged kind="none".
//
// Compensation is a Chest Fragment per lost haul — the FALLBACK the code was supposed to hand out when a real
// haul can't be granted. Not the gear or chest they might have rolled: nobody knows what those rolls would have
// been, and inventing generous outcomes for an unknown is how a bug becomes a windfall.
//
// --apply to grant; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

// The window: from the commit that broke the fragment fallback, to now.
const BROKE_AT = "2026-07-31 06:52:00Z";
const MARK = "fishing-treasure-makegood-2026-08-01";

// Idempotent: the grant is logged as an activity event, and anybody already carrying the mark is skipped. A
// compensation script that can double-pay on a re-run is worse than the bug it fixes.
const already = await sql`
    SELECT DISTINCT buyer_id FROM mkt_activity_event
     WHERE event = 'treasure_makegood' AND meta->>'mark' = ${MARK}`;
const paid = new Set(already.map((r) => r.buyer_id));

const owed = await sql`
    SELECT buyer_id, COUNT(*)::int AS n
      FROM mkt_activity_event
     WHERE event = 'fish_treasure' AND meta->>'kind' = 'none' AND created_at > ${BROKE_AT}::timestamptz
     GROUP BY buyer_id ORDER BY 2 DESC`;

const targets = owed.filter((r) => !paid.has(r.buyer_id));
const names = await sql`
    SELECT id, COALESCE(NULLIF(display_name,''), alias, 'a member') AS name
      FROM mkt_buyer WHERE id = ANY(${targets.map((t) => t.buyer_id)})`;
const nameOf = new Map(names.map((n) => [n.id, n.name]));

console.log(`\n${owed.length} members affected, ${paid.size} already compensated`);
console.log(`${targets.length} to pay, ${targets.reduce((s, t) => s + t.n, 0)} fragments total\n`);
for (const t of targets) console.log(`  ${(nameOf.get(t.buyer_id) || t.buyer_id).padEnd(20)} ${t.n} fragment(s)`);

if (!APPLY) { console.log("\nDRY RUN — nothing granted. Re-run with --apply.\n"); process.exit(0); }

for (const t of targets) {
    await sql`
        INSERT INTO mkt_sailing (buyer_id, fragments) VALUES (${t.buyer_id}, ${t.n})
        ON CONFLICT (buyer_id) DO UPDATE SET fragments = COALESCE(mkt_sailing.fragments, 0) + ${t.n}`;
    await sql`
        INSERT INTO mkt_activity_event (buyer_id, event, meta)
        VALUES (${t.buyer_id}, 'treasure_makegood', ${JSON.stringify({ mark: MARK, fragments: t.n })}::jsonb)`;
    console.log(`paid ${nameOf.get(t.buyer_id) || t.buyer_id}: ${t.n}`);
}
console.log(`\nDone — ${targets.length} members, ${targets.reduce((s, t) => s + t.n, 0)} fragments.\n`);
