// Hand every allocated skill point back.
//
// WHY. The Reaver tree was rewritten from the ground up — twelve new nodes, new ids, one lever each. The old
// ids (rv_might, rv_crit, rv_strike and the rest) no longer exist, so every point a Reaver had spent is
// allocated to a node that is not there any more. treeEffects ignores an id it does not recognise, which means
// those points currently grant NOTHING: not something wrong, simply nothing at all. Anyone who had specced
// into the class is walking around weaker than their level says and has no way to fix it themselves, because
// the respec screen can only refund nodes it can still find.
//
// So the allocation is cleared for everybody. `skill_tree` is the only thing touched: the level, the XP and
// therefore the number of points available are all derived elsewhere and are left exactly as they are, so
// every member gets back precisely what they had spent and can spend it again immediately.
//
// EVERYBODY, not just Reavers, on Luke's call — the other two trees are being rewritten next and a second
// refund a day later is worse than one now.
//
// The removed allocations are written to mkt_activity_event first, so this is reversible: every member's exact
// spread is recorded under `tree_refund` before a single row is changed.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const rows = await sql`
    SELECT a.buyer_id, b.display_name, a.skill_tree, a.arena_class
      FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
     WHERE a.skill_tree IS NOT NULL AND a.skill_tree::text NOT IN ('{}', 'null')`;

const hit = [];
let points = 0;
for (const r of rows) {
    const taken = typeof r.skill_tree === "string" ? JSON.parse(r.skill_tree) : (r.skill_tree || {});
    const spent = Object.values(taken).reduce((a, n) => a + (Number(n) || 0), 0);
    if (!spent) continue;
    hit.push({ id: r.buyer_id, name: r.display_name, cls: r.arena_class, spent, taken });
    points += spent;
}

console.log(`${hit.length} members hold ${points} allocated points\n`);
for (const h of hit.sort((a, z) => z.spent - a.spent)) {
    console.log(`  ${(h.name || h.id).padEnd(20)} ${String(h.spent).padStart(3)} points  ${h.cls || "no class"}  ${Object.keys(h.taken).length} nodes`);
}

if (!APPLY) { console.log("\ndry run — pass --apply to write"); process.exit(0); }

const done = await sql`SELECT 1 FROM mkt_activity_event WHERE event = 'tree_refund' LIMIT 1`;
if (done.length) { console.log("already run — mkt_activity_event carries a tree_refund marker."); process.exit(0); }

// Recorded BEFORE anything changes, so the exact spreads survive even if the loop below dies halfway.
await sql`
    INSERT INTO mkt_activity_event (buyer_id, event, meta)
    VALUES (NULL, 'tree_refund', ${JSON.stringify({ points, members: hit })}::jsonb)`;

for (const h of hit) {
    await sql`UPDATE mkt_arena SET skill_tree = '{}'::jsonb WHERE buyer_id = ${h.id}`;
}
console.log(`\napplied — ${hit.length} members refunded, ${points} points back in their pools. Spreads recorded under tree_refund.`);
