// Take back every badge a treasure chest handed out.
//
// Opening a chest had a flat 4% chance to grant a random drop_only badge. drop_only was the whole gate, so the
// pool included ACHIEVEMENT badges — "Forged a single item all the way to +10", "Jackpot" — which were landing
// on members who had never touched the Forge or the wheel. It also included the Mark of Shame, which is
// reserved for whoever the owner puts in the stockade, and one had already dropped to a random opener.
//
// A badge is supposed to mean you did a thing. A roll on a chest means only that you opened a chest.
//
// PRECISION: awarded_by='drop' covers BOTH chest drops and the boss-kill drop to the top damage dealer, and
// the boss one is legitimate — killing the boss IS the achievement. They are told apart by correlating the
// award time against real activity: an open_chest event within 20s, or a boss defeated_at within 2 minutes.
// On the live data that splits 45 chest / 2 boss with nothing ambiguous, so nobody legitimate loses anything.
//
// Badges with an auto_rule that the member has genuinely earned will simply come back on the next
// syncEarnedBadges — which is correct, and is why this deletes the row rather than blacklisting it.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const sql = neon(readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim());

const rows = await sql`
    SELECT ub.buyer_id, COALESCE(b.display_name, b.alias) AS who, ub.badge_slug,
           to_char(ub.awarded_at AT TIME ZONE 'America/Chicago', 'MM-DD HH24:MI:SS') AS t,
           EXISTS(SELECT 1 FROM mkt_activity_event e
                   WHERE e.buyer_id = ub.buyer_id AND e.event = 'open_chest'
                     AND e.created_at BETWEEN ub.awarded_at - INTERVAL '20 seconds'
                                          AND ub.awarded_at + INTERVAL '20 seconds') AS from_chest,
           EXISTS(SELECT 1 FROM boss_event be
                   WHERE be.defeated_at BETWEEN ub.awarded_at - INTERVAL '2 minutes'
                                            AND ub.awarded_at + INTERVAL '2 minutes') AS from_boss
      FROM mkt_user_badge ub JOIN mkt_buyer b ON b.id = ub.buyer_id
     WHERE ub.awarded_by = 'drop'
     ORDER BY ub.awarded_at`;

const chest = rows.filter((r) => r.from_chest && !r.from_boss);
const boss = rows.filter((r) => r.from_boss);
const ambiguous = rows.filter((r) => !r.from_chest && !r.from_boss);

console.log(`\n${rows.length} drop-awarded badges: ${chest.length} from chests, ${boss.length} from boss kills, ${ambiguous.length} ambiguous\n`);
const byWho = new Map();
for (const r of chest) byWho.set(r.who, [...(byWho.get(r.who) || []), r.badge_slug]);
for (const [who, slugs] of [...byWho].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(who).padEnd(20)} −${String(slugs.length).padStart(2)}  ${slugs.join(", ")}`);
}
if (boss.length) console.log(`\nKEPT (earned on a boss kill): ${boss.map((r) => `${r.who}/${r.badge_slug}`).join(", ")}`);
if (ambiguous.length) console.log(`\nNOT TOUCHED — could not be tied to a chest: ${ambiguous.map((r) => `${r.who}/${r.badge_slug}`).join(", ")}`);

if (!chest.length) { console.log("\nnothing to revoke.\n"); process.exit(0); }
if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

let removed = 0;
for (const r of chest) {
    const del = await sql`
        DELETE FROM mkt_user_badge
         WHERE buyer_id = ${r.buyer_id} AND badge_slug = ${r.badge_slug} AND awarded_by = 'drop'
        RETURNING buyer_id`;
    removed += del.length;
}
console.log(`\nDone — ${removed} badges revoked across ${byWho.size} members.\n`);
