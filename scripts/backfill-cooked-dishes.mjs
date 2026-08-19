// Hand back every dish that was cooked before a dish was a thing you could keep.
//
// THE GAP. Until 2026-08-18 a cooked dish paid its reward and then stopped existing — sixty-four plates in the
// book and not one of them an object. `6c27600f` changed that: you keep the plate, and a plate is pet food.
// Everyone who had cooked before that point kept nothing, which SoullessShiitake asked about in global chat
// the same evening: "Seems like none of the dishes we've previously cooked count?" They did not. Luke: "any
// dish cooked before the cutoff is fine to provide XP for pets, that was the whole intention."
//
// WHAT THIS GRANTS. The PLATES, not the XP. Cooking hands you the dish and lets you choose which animal eats
// it; paying the XP straight into a pet would take that choice away and would land on whichever pet happened
// to be out. So this grants exactly what the cook would have granted at the time — `grantConsumable(recipeId)`
// — through the same table the Kitchen writes to.
//
// RECONSTRUCTED FROM `mkt_activity_event`. Every cook is logged with `meta.made` (the recipe id) and
// `meta.portions`, and has been since 2026-07-31. Prep ingredients and bait are logged the same way and are
// NOT dishes, so they are filtered on `kind === "dish"` from the real recipe catalog rather than by guessing
// at id prefixes.
//
// THE CUTOVER ERRS EARLY, ON PURPOSE. mkt_user_consumable is (buyer_id, consumable_id, count) with no
// timestamp, so there is nothing in the database that dates the first plate and no way to measure where the
// live path took over. The boundary is therefore the COMMIT time of 6c27600f — 2026-08-18 11:27:58 -0500 —
// which is necessarily at or before the deploy.
//
// That direction is the safe one. Anything cooked between the commit and the deploy landing is skipped here
// and got nothing from the live path either, so a few plates go unpaid; the other direction would pay a plate
// twice, and a stash that quietly grew is a bug nobody would ever report. Six dish cooks sit in that window.
//
// Idempotent by a marker row: a successful run writes `cook_dish_backfill` into mkt_activity_event, and a
// second run finds it and refuses. --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

import { RECIPES } from "../src/lib/marketplace/cooking-recipes.js";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

// The pet-XP ladder, mirrored from consumables.js purely to PRINT what the grant is worth. Nothing is written
// from it — the plates carry their own value — but a mirrored number can still drift, so the source is checked.
const SRC = readFileSync("src/lib/marketplace/consumables.js", "utf8");
if (!SRC.includes("export const DISH_PET_XP = { 1: 10, 2: 25, 3: 60, 4: 150, 5: 350 };")) {
    throw new Error("consumables.js no longer matches this script's copy of DISH_PET_XP — re-read it before running");
}
const XP = { 1: 10, 2: 25, 3: 60, 4: 150, 5: 350 };

const dishTier = new Map(RECIPES.filter((r) => r.kind === "dish").map((r) => [r.id, r.tier]));

const done = await sql`SELECT 1 FROM mkt_activity_event WHERE event = 'cook_dish_backfill' LIMIT 1`;
if (done.length) {
    console.log("already run — mkt_activity_event carries a cook_dish_backfill marker. Nothing to do.");
    process.exit(0);
}

const cutover = "2026-08-18T16:27:58Z";   // 6c27600f, "Every dish is food now", in UTC
console.log("cutover (commit that made a dish an object):", cutover);

const rows = await sql`
    SELECT buyer_id, meta FROM mkt_activity_event
     WHERE event = 'cooked' AND created_at < ${cutover}`;

const owed = new Map();   // buyer -> { recipeId -> plates }
let plates = 0, xp = 0, skipped = 0;
for (const r of rows) {
    const made = r.meta?.made;
    const tier = dishTier.get(made);
    if (!tier) { skipped += 1; continue; }          // prep and bait are not food
    const n = Math.max(1, Number(r.meta?.portions) || 1);
    if (!owed.has(r.buyer_id)) owed.set(r.buyer_id, new Map());
    const m = owed.get(r.buyer_id);
    m.set(made, (m.get(made) || 0) + n);
    plates += n; xp += (XP[tier] || 0) * n;
}

const names = new Map((await sql`SELECT id, display_name FROM mkt_buyer WHERE id = ANY(${[...owed.keys()]})`)
    .map((b) => [b.id, b.display_name]));

console.log(`${rows.length} cooks read · ${skipped} were prep or bait · ${plates} plates owed to ${owed.size} members · ${xp} pet XP in total`);
for (const [buyer, m] of [...owed.entries()].sort((a, z) => z[1].size - a[1].size)) {
    const total = [...m.entries()].reduce((s, [id, n]) => s + (XP[dishTier.get(id)] || 0) * n, 0);
    console.log(`  ${(names.get(buyer) || buyer).padEnd(20)} ${[...m.values()].reduce((a, b) => a + b, 0)} plates · ${total} pet XP · ${m.size} kinds`);
}

if (!APPLY) { console.log("\ndry run — pass --apply to write"); process.exit(0); }

let writes = 0;
for (const [buyer, m] of owed) {
    for (const [id, n] of m) {
        await sql`
            INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES (${buyer}, ${id}, ${n})
            ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + ${n}`;
        writes += 1;
    }
}
await sql`
    INSERT INTO mkt_activity_event (buyer_id, event, meta)
    VALUES (NULL, 'cook_dish_backfill', ${JSON.stringify({ plates, xp, members: owed.size, cutover })}::jsonb)`;
console.log(`\napplied — ${writes} stash rows written, ${plates} plates to ${owed.size} members. Marker recorded.`);
