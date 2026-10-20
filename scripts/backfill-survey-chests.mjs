// Pay the Mythic Chest to everybody who answered a survey before there was a reward for it.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/backfill-survey-chests.mjs            dry run
//   node --import ./scripts/lib/register-loader.mjs scripts/backfill-survey-chests.mjs --apply    pay
//
// Luke: "the survey should reward a mythic chest... backfill for if someone already did it."
//
// ONE PER PERSON, NOT PER ROUND. Luke: "Just one chest at the end."
//
// I ran this per round first and paid the twenty-eight members who answered both of them twice;
// _survey-chest-dedupe.mjs put that back. The rule is the simpler one: helping is worth a chest, and it is
// worth a chest once. 76 members, 76 chests, and a fourth round next spring pays only people who have never
// answered.
//
// WHY THAT IS SAFE: the Den mints about 1,300 mythic chests a month, so this is roughly two days of ordinary
// supply, once. Mythic is also the highest tier carrying no real-world money — celestial and primordial pay
// store credit at the till, which is not something to hand out for filling in a form.
//
// IDEMPOTENT THROUGH THE SAME LEDGER THE LIVE PATH USES. paySurveyChest refuses if the member holds ANY
// `survey_r%` grant; this calls that function rather than its own INSERT, so the backfill and the live path
// cannot drift about what "already thanked" means — and somebody backfilled today gets nothing extra when
// they answer round 3 tonight, which is the whole point of the rule.
import fs from "node:fs";

process.env.DATABASE_URL = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8")
    .match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { paySurveyChest, SURVEY_CHEST } = await import("@/lib/marketplace/survey.js");

const APPLY = process.argv.includes("--apply");

// Everyone who answered, oldest round first, with the name so the dry run is readable rather than a list of
// uuids. A response whose member row is gone is skipped by the join — there is nobody to pay.
const rows = await db.query(
    `SELECT s.buyer_id, s.round, COALESCE(NULLIF(b.display_name,''), b.alias) AS who
       FROM mkt_survey_response s
       JOIN mkt_buyer b ON b.id = s.buyer_id
      WHERE s.round < 3
      ORDER BY s.round, who`);

// ⚠️ KEYED ON THE MEMBER, NOT ON MEMBER-AND-ROUND. Keying it per round is exactly what paid the repeat
// answerers twice, and it would do it again on the next run: the duplicate grant rows have since been
// deleted, so a per-round key would read those members as unpaid and hand out another twenty-eight chests.
const paidAlready = new Set(
    (await db.query(`SELECT DISTINCT buyer_id FROM mkt_chest_grant WHERE source LIKE 'survey\\_r%'`))
        .map((r) => r.buyer_id),
);
const seen = new Set();
const todo = rows.filter((r) => {
    if (paidAlready.has(r.buyer_id) || seen.has(r.buyer_id)) return false;
    seen.add(r.buyer_id);
    return true;
});

const byRound = {};
for (const r of todo) byRound[r.round] = (byRound[r.round] || 0) + 1;
console.log(`${rows.length} answer(s) on record · ${paidAlready.size} already paid · ${todo.length} to pay`);
console.log(Object.entries(byRound).map(([k, v]) => `  round ${k}: ${v} x ${SURVEY_CHEST}`).join("\n"));
console.log(`  ${new Set(todo.map((r) => r.buyer_id)).size} distinct member(s)\n`);
for (const r of todo.slice(0, 6)) console.log(`   r${r.round}  ${r.who}`);
if (todo.length > 6) console.log(`   … and ${todo.length - 6} more`);

if (!APPLY) { console.log("\nDRY RUN. Re-run with --apply to pay."); process.exit(0); }

let ok = 0;
for (const r of todo) {
    if (await paySurveyChest(r.buyer_id, r.round).catch(() => false)) ok += 1;
}
const check = await db.query(
    `SELECT source, COUNT(*)::int n FROM mkt_chest_grant WHERE source LIKE 'survey_r%' GROUP BY source ORDER BY source`);
console.log(`\npaid ${ok}/${todo.length}. Ledger now holds: ${check.map((c) => `${c.source}=${c.n}`).join("  ")}`);
