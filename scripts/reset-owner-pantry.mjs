// Strip the owner's pantry back to only what the farm actually produced today.
//
// Everything else in there came from the owner dev-stock tool while the Kitchen was being built — 30 of every
// fish in the game, which is not a thing anyone could have caught.
//
// Pantry rows carry no timestamps, only quantities, so "what did the farm give me today" cannot be read off the
// pantry itself. It's reconstructed from the harvest_crop activity events for the current STORE day, which
// record the seed each harvest came from. One crop per harvest: that's what farm-crops banks, except on a
// doubled harvest, which the event doesn't distinguish — so this deliberately under-counts rather than
// inventing stock that might not have existed.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const OWNER = "6857d67e-3dd0-46b6-aad7-b91699155ff6";

const before = await sql`
    SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = ${OWNER} AND qty > 0 ORDER BY kind, ref`;
const harvest = await sql`
    SELECT meta->>'seedId' AS seed, COUNT(*)::int AS n
      FROM mkt_activity_event
     WHERE buyer_id = ${OWNER} AND event = 'harvest_crop'
       AND meta->>'seedId' IS NOT NULL
       AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
     GROUP BY 1 ORDER BY 1`;

const byKind = {};
for (const r of before) byKind[r.kind] = (byKind[r.kind] || 0) + Number(r.qty);
console.log("\nBEFORE");
console.log(`  ${before.length} rows — ` + Object.entries(byKind).map(([k, v]) => `${k}: ${v}`).join(", "));
console.log("\nKEEPING (harvested today)");
for (const h of harvest) console.log(`  crop  ${h.seed.padEnd(14)} x${h.n}`);
const keepTotal = harvest.reduce((s, h) => s + h.n, 0);
console.log(`  ${harvest.length} kinds, ${keepTotal} items`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

// Wipe and re-lay rather than reconciling row by row: the target state is fully known, and a diff would leave
// any row this script didn't think to look for quietly in place.
await sql`DELETE FROM mkt_pantry WHERE buyer_id = ${OWNER}`;
for (const h of harvest) {
    await sql`INSERT INTO mkt_pantry (buyer_id, kind, ref, qty) VALUES (${OWNER}, 'crop', ${h.seed}, ${h.n})
              ON CONFLICT (buyer_id, kind, ref) DO UPDATE SET qty = EXCLUDED.qty`;
}

const after = await sql`
    SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = ${OWNER} AND qty > 0 ORDER BY kind, ref`;
console.log("\nAFTER");
for (const r of after) console.log(`  ${r.kind.padEnd(6)} ${r.ref.padEnd(14)} x${r.qty}`);
console.log(`  ${after.length} rows\n`);
