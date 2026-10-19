// Hand back the nine dishes that cooked into nothing.
//
// THE GAP. consumables.js builds a CONSUMABLE for every dish by iterating a HAND-WRITTEN list of books —
// `[...RECIPES, ...MASTER_RECIPES, ...SEASON_RECIPES]`. Two books were added to cooking-recipes.js after that
// line was written and never joined it: the six DEEP_RECIPES behind the charts and the three
// HALLOWEEN_RECIPES. So cooking one of those nine paid its ladder rung and then called
// `grantConsumable(buyerId, rec.id, 1)` with an id that resolves to nothing — no plate, no pet XP, no row.
//
// GrayKitsune found it by counting: "I think a few of the new cooking recipes aren't giving the food item, I
// had 5 mythic chests after doing some cooking but only like 3 +exp items."
//
// The loop reads FULL_BOOK now, so a seventh book is covered the day it is written. This hands back what the
// nine owed in the meantime.
//
// WHAT THIS GRANTS — the PLATES, not the XP, for the same reason backfill-cooked-dishes.mjs did: cooking
// hands you the dish and lets you choose which animal eats it, and paying XP straight in would spend it on
// whichever pet happens to be out.
//
// RECONSTRUCTED FROM `mkt_activity_event`. Every cook writes `cooked` with `meta.recipe`, so the count is
// exact and needs no cutover date — these nine have never once been granted, from the day they shipped.
//
// Idempotent by a marker row: a successful run writes `deep_hw_dish_backfill` into mkt_activity_event and a
// second run refuses. --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];
const sql = neon(url);

// The nine, spelled out rather than imported: this script is a record of one defect at one moment, and
// reading today's catalogue would make it silently change meaning the next time a book is added.
const OWED = [
    "r_lanternjaw_broth", "r_glassfin_crudo", "r_bonecrab_boil", "r_gulper_pie", "r_hadal_eight",
    "r_lightless_table", "r_hw_wick_fry", "r_hw_bonepike_board", "r_hw_drowned_feast",
];

const already = await sql`SELECT 1 AS x FROM mkt_activity_event WHERE event = 'deep_hw_dish_backfill' LIMIT 1`;
if (already.length) {
    console.log("Already run — the marker row is in mkt_activity_event. Nothing to do.");
    process.exit(0);
}

const rows = await sql`
    SELECT e.buyer_id, COALESCE(b.display_name, b.alias, '?') AS who, e.meta->>'recipe' AS recipe, COUNT(*)::int AS n
      FROM mkt_activity_event e
      LEFT JOIN mkt_buyer b ON b.id = e.buyer_id
     WHERE e.event = 'cooked' AND e.meta->>'recipe' = ANY(${OWED})
     GROUP BY 1, 2, 3
     ORDER BY 2, 3`;

let total = 0;
for (const r of rows) {
    console.log(`  ${APPLY ? "grant" : "would grant"}  ${String(r.who).padEnd(18)} ${r.recipe.padEnd(22)} x${r.n}`);
    total += r.n;
    if (!APPLY) continue;
    await sql`
        INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES (${r.buyer_id}, ${r.recipe}, ${r.n})
        ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + ${r.n}`;
}

console.log(`\n${total} plate(s) across ${new Set(rows.map((r) => r.buyer_id)).size} member(s).`);
if (!APPLY) { console.log("Dry run. Re-run with --apply to write."); process.exit(0); }

await sql`INSERT INTO mkt_activity_event (buyer_id, event, meta)
          VALUES (${rows[0]?.buyer_id || null}, 'deep_hw_dish_backfill', ${JSON.stringify({ plates: total })}::jsonb)`;
console.log("Done, and the marker is written.");
