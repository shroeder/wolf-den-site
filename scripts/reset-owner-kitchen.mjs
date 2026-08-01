// Put the owner's kitchen back to fresh after a day of testing it.
//
// Everything the Kitchen produced today was produced by its author poking at it, so none of it should stand as
// a record or sit in a stash. The UPGRADES stay — those were bought with 1,600 gold of real, separately-earned
// coin, and buying them is not the thing being undone.
//
// Deliberately narrow: it removes what COOKING produced, not everything in the pantry. Crops and fish were
// earned on the farm and at sea and have nothing to do with this.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const OWNER = "6857d67e-3dd0-46b6-aad7-b91699155ff6";

const STARTERS = ["k_flour", "r_porridge", "r_roast_roots"];
const COOK_BADGES = [
    "cook_first", "cook_apprentice", "cook_chef", "cook_thousand", "cook_master",
    "cook_collector", "cook_librarian", "cook_legendary", "cook_forager", "cook_prep",
    "cook_every_tier", "cook_perfect", "cook_chain", "cook_grand", "cook_wolfs",
];
// The two consumables today's three cooks actually paid out (Growth Tonic from the porridge, Pet Treat from the
// crab). Named explicitly rather than wiping the stash, which holds plenty that was earned elsewhere.
const COOK_CONSUMABLES = { farm_growth_tonic: 1, treat_bone: 1 };

const show = async (label, q) => { const r = await q; console.log(`  ${label}: ${JSON.stringify(r)}`); return r; };

console.log("\nBEFORE");
await show("kitchen", sql`SELECT cooks_total, cook_xp, preps_total, best_dish_tier, best_quality, best_chain, tiers_cooked,
                                 heat_level, season_level, batch_level, larder_level
                            FROM mkt_kitchen WHERE buyer_id = ${OWNER}`);
await show("recipes", sql`SELECT COUNT(*)::int AS n FROM mkt_recipe_known WHERE buyer_id = ${OWNER}`);
await show("preps", sql`SELECT ref, qty FROM mkt_pantry WHERE buyer_id = ${OWNER} AND kind = 'prep' AND qty > 0`);
await show("cook badges", sql`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = ${OWNER} AND badge_slug = ANY(${COOK_BADGES})`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply.\n"); process.exit(0); }

// 1. Counters and bests back to zero. Track levels are NOT touched.
await sql`UPDATE mkt_kitchen
             SET cooks_total = 0, cook_xp = 0, preps_total = 0, cooks_today = 0, cook_day = NULL,
                 best_dish_tier = 0, best_quality = 0, best_chain = 0, tiers_cooked = 0, updated_at = NOW()
           WHERE buyer_id = ${OWNER}`;

// 2. Recipe book back to the three you start with. The other 61 came from the owner dev-stock tool.
await sql`DELETE FROM mkt_recipe_known WHERE buyer_id = ${OWNER} AND recipe_id <> ALL(${STARTERS})`;
await sql`UPDATE mkt_recipe_known SET times_cooked = 0 WHERE buyer_id = ${OWNER}`;

// 3. Prepped ingredients only exist because something cooked them.
await sql`DELETE FROM mkt_pantry WHERE buyer_id = ${OWNER} AND kind = 'prep'`;

// 4. Badges earned off the back of it.
await sql`DELETE FROM mkt_user_badge WHERE buyer_id = ${OWNER} AND badge_slug = ANY(${COOK_BADGES})`;

// 5. The two consumables today's cooks paid out. Decrement, never delete — the same rows hold quantities
//    earned from the farm, chests and the boss, and those are not in scope.
for (const [id, n] of Object.entries(COOK_CONSUMABLES)) {
    await sql`UPDATE mkt_user_consumable SET count = GREATEST(0, count - ${n})
               WHERE buyer_id = ${OWNER} AND consumable_id = ${id}`.catch(() => {});
}

console.log("\nAFTER");
await show("kitchen", sql`SELECT cooks_total, cook_xp, preps_total, best_dish_tier, best_quality, best_chain, tiers_cooked,
                                 heat_level, season_level, batch_level, larder_level
                            FROM mkt_kitchen WHERE buyer_id = ${OWNER}`);
await show("recipes", sql`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = ${OWNER} ORDER BY recipe_id`);
await show("preps", sql`SELECT ref, qty FROM mkt_pantry WHERE buyer_id = ${OWNER} AND kind = 'prep' AND qty > 0`);
await show("cook badges", sql`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = ${OWNER} AND badge_slug = ANY(${COOK_BADGES})`);
console.log("\nUpgrades intentionally preserved.\n");
