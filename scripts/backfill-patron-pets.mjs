// ── BACKFILL THE PATRONAGE LADDER ────────────────────────────────────────────────────────────────────────────
// Luke: "5 exclusive pets unlocked at 50 100 250 500 and 1000 backfilled, dollars."
//
// The ladder is LIFETIME, so a member who has spent $300 over four months has already earned the first three
// rungs — they simply were not pets yet. Without this they would have to spend again to be given credit for
// money they have already handed over, which is the opposite of what a loyalty ladder is for.
//
// Safe to run more than once. grantPatronPets inserts with ON CONFLICT DO NOTHING and reports only the rows
// it actually created, so a second run grants nothing and says so.
//
//   node scripts/backfill-patron-pets.mjs --dry    show what it would do
//   node scripts/backfill-patron-pets.mjs          do it
import { readFileSync } from "node:fs";

const env = readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
for (const l of env.split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const DRY = process.argv.includes("--dry");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { patronPetsFor, PATRON_PETS } = await import("@/lib/marketplace/patronage.js");

console.log(`rungs: ${PATRON_PETS.map((p) => `$${p.spend} ${p.name}`).join(" · ")}\n`);

// The same reconstruction lifetimeSpendCents does, in one pass for everybody rather than 64 round trips.
const rows = await sql`
    SELECT e.buyer_id, b.alias,
           ROUND(SUM(COALESCE((e.meta->>'amountCents')::numeric, e.points * 100.0 / 5)) / 100.0)::int AS dollars
      FROM mkt_xp_event e JOIN mkt_buyer b ON b.id = e.buyer_id
     WHERE e.action = 'purchase_spend'
     GROUP BY e.buyer_id, b.alias
     ORDER BY dollars DESC`;

let granted = 0, touched = 0;
for (const r of rows) {
    const earned = patronPetsFor(r.dollars);
    if (!earned.length) continue;
    if (DRY) {
        const have = await sql`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = ${r.buyer_id}::uuid AND category='pet' AND ref = ANY(${earned.map((p) => p.id)})`;
        const missing = earned.filter((p) => !have.some((h) => h.ref === p.id));
        if (missing.length) { touched++; granted += missing.length; console.log(`  ${(r.alias || "?").padEnd(20)} $${String(r.dollars).padStart(5)} -> ${missing.map((p) => p.name).join(", ")}`); }
        continue;
    }
    const ins = await sql`
        INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref)
        SELECT ${r.buyer_id}::uuid, 'pet', unnest(${earned.map((p) => p.id)}::text[])
        ON CONFLICT DO NOTHING
        RETURNING ref`;
    if (ins.length) { touched++; granted += ins.length; console.log(`  ${(r.alias || "?").padEnd(20)} $${String(r.dollars).padStart(5)} -> ${ins.map((x) => PATRON_PETS.find((p) => p.id === x.ref)?.name || x.ref).join(", ")}`); }
}
console.log(`\n${DRY ? "WOULD GRANT" : "GRANTED"} ${granted} pets to ${touched} members (of ${rows.length} with in-store spend)`);
