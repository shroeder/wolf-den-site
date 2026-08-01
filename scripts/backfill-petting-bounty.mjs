// Credit today's petting toward the "Good Company" town bounty.
//
// The bounty reads "Feed OR PET your pets 3 times" but only `feed_pet` was mapped in ACTIVITY_QUEST_KEYS.
// Petting fires `pet_farm` (your own) or `pet_other` (a friend's), and neither was listened for — so members
// petted and watched the counter sit where it was. 88 pets across 20 members today alone.
//
// The mapping is fixed going forward; this credits the pets already done TODAY so nobody has to redo them.
// Only today: town bounties reset daily, so yesterday's progress can't be claimed any more anyway.
//
// Progress is RAISED to the true count, never added to — a member who also fed a pet already has some progress
// from the path that did work, and adding would double-count them.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const TARGET = 3; // "Good Company" — the only beastfriend variant

const petted = await sql`
    SELECT e.buyer_id, COALESCE(b.display_name, b.alias) AS who, COUNT(*)::int AS pets
      FROM mkt_activity_event e JOIN mkt_buyer b ON b.id = e.buyer_id
     WHERE e.event IN ('pet_farm', 'pet_other')
       AND (e.created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
     GROUP BY 1, 2 ORDER BY 3 DESC`;

const current = await sql`
    SELECT buyer_id, progress, claimed FROM mkt_town_quest
     WHERE key = 'beastfriend' AND day = (NOW() AT TIME ZONE 'America/Chicago')::date`;
const now = new Map(current.map((r) => [r.buyer_id, { progress: Number(r.progress) || 0, claimed: r.claimed }]));

const plan = [];
for (const p of petted) {
    const cur = now.get(p.buyer_id) || { progress: 0, claimed: false };
    if (cur.claimed) continue;                       // already paid out; leave it alone
    const want = Math.min(TARGET, cur.progress + p.pets);
    if (want <= cur.progress) continue;              // feeding already covered them
    plan.push({ ...p, from: cur.progress, to: want });
}

console.log(`\n${petted.length} members petted today · ${plan.length} need crediting\n`);
for (const r of plan) {
    console.log(`  ${(r.who || r.buyer_id).padEnd(18)} ${r.pets} pets · progress ${r.from} → ${r.to}${r.to >= TARGET ? "  ✓ completes it" : ""}`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

for (const r of plan) {
    await sql`
        INSERT INTO mkt_town_quest (buyer_id, day, key, progress, claimed)
        VALUES (${r.buyer_id}, (NOW() AT TIME ZONE 'America/Chicago')::date, 'beastfriend', ${r.to}, FALSE)
        ON CONFLICT (buyer_id, day, key) DO UPDATE SET progress = GREATEST(mkt_town_quest.progress, ${r.to})`;
}
console.log(`\nCredited ${plan.length} members. ${plan.filter((r) => r.to >= TARGET).length} can now claim it.\n`);
