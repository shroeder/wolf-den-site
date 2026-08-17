// ── WHERE RECIPES ACTUALLY COME FROM ─────────────────────────────────────────────────────────────────────────
// This used to MODEL the answer: parse a `RECIPE_SOURCES` table out of cooking.js, read a `chance` off each
// source, multiply by seven days of activity events. That design is gone — a recipe is an outcome inside each
// feature's own reward ladder now, drawn like any other prize, so there is no per-source chance left to read.
// The script had been throwing on `match(...)[1]` of null ever since, which means the number everyone quotes
// ("~1.9 recipes per member per week") has had nothing keeping it honest.
//
// So it MEASURES instead of modelling. Every learn is stamped with the source that taught it
// (learnRecipe's `source`), which is strictly better than a model: it cannot drift from the code, it counts
// the shop and the powers and anything else added later for free, and it needs no maintenance when a ladder
// is retuned.
//
// Run:  node scripts/audit-recipe-rates.mjs [--days 7]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)[1]);
const i = process.argv.indexOf("--days");
const DAYS = Math.max(1, Number(i > -1 ? process.argv[i + 1] : 7) || 7);

const rows = await sql`
    SELECT COALESCE(source, '(unrecorded)') AS source, COUNT(*)::int AS n
      FROM mkt_recipe_known
     WHERE learned_at > NOW() - (INTERVAL '1 day' * ${DAYS})
     GROUP BY 1 ORDER BY n DESC`;
const [{ n: members }] = await sql`
    SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_activity_event
     WHERE created_at > NOW() - (INTERVAL '1 day' * ${DAYS})`;

const total = rows.reduce((s, r) => s + r.n, 0);
console.table(rows.map((r) => ({ source: r.source, learned: r.n, share: `${((r.n / Math.max(1, total)) * 100).toFixed(1)}%`, perWk: +((r.n / DAYS) * 7).toFixed(1) })));

const perWk = (total / DAYS) * 7;
const each = perWk / Math.max(1, members);
console.log(`\n${total} recipes learned in ${DAYS} days = ${perWk.toFixed(1)}/wk across ${members} active members = ${each.toFixed(2)} each per week`);
console.log(`a 64-page book in ~${(64 / Math.max(0.01, each)).toFixed(0)} weeks`);
// The concentration is the number worth watching: two sources carrying most of the supply is the shape that
// made the book feel like a farming loop rather than something the whole game hands you.
const top2 = rows.slice(0, 2).reduce((s, r) => s + r.n, 0);
console.log(`top two sources = ${((top2 / Math.max(1, total)) * 100).toFixed(0)}% of everything learned`);
