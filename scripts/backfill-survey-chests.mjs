// Pay the Mythic Chest to everybody who answered a survey before there was a reward for it.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/backfill-survey-chests.mjs            dry run
//   node --import ./scripts/lib/register-loader.mjs scripts/backfill-survey-chests.mjs --apply    pay
//
// Luke: "the survey should reward a mythic chest... backfill for if someone already did it."
//
// PER ROUND, NOT PER PERSON. The reward is for answering a survey, and twenty-eight members answered two of
// them — in August about a game that had no casino, and again in October about one that did. Those are two
// separate favours and they are paid as two. 34 + 70 = 104 chests across 76 members.
//
// WHY THAT IS SAFE: the Den mints about 1,300 mythic chests a month, so this is roughly two days of ordinary
// supply, once. Mythic is also the highest tier carrying no real-world money — celestial and primordial pay
// store credit at the till, which is not something to hand out for filling in a form.
//
// IDEMPOTENT THROUGH THE SAME LEDGER THE LIVE PATH USES. paySurveyChest writes one `survey_rN` grant row per
// member per round and refuses if one exists; this calls that function rather than its own INSERT, so a
// re-run pays nobody twice and a member who answers round 3 tomorrow is unaffected by what happened here.
import fs from "node:fs";

process.env.DATABASE_URL = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8")
    .match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { paySurveyChest, SURVEY_CHEST, surveyChestSource } = await import("@/lib/marketplace/survey.js");

const APPLY = process.argv.includes("--apply");

// Everyone who answered, oldest round first, with the name so the dry run is readable rather than a list of
// uuids. A response whose member row is gone is skipped by the join — there is nobody to pay.
const rows = await db.query(
    `SELECT s.buyer_id, s.round, COALESCE(NULLIF(b.display_name,''), b.alias) AS who
       FROM mkt_survey_response s
       JOIN mkt_buyer b ON b.id = s.buyer_id
      WHERE s.round < 3
      ORDER BY s.round, who`);

const paidAlready = new Set(
    (await db.query(`SELECT buyer_id, source FROM mkt_chest_grant WHERE source LIKE 'survey_r%'`))
        .map((r) => `${r.buyer_id}:${r.source}`),
);
const todo = rows.filter((r) => !paidAlready.has(`${r.buyer_id}:${surveyChestSource(r.round)}`));

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
