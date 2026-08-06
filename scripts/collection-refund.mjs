// ── PAYING PEOPLE BACK FOR THE FORGE WORK ON COLLECTION PIECES ───────────────────────────────────────────────
// Collection pieces (farm / mine / wheel / sailing sets) stopped being wearable when their bonuses became
// permanent on ownership. Anybody who had forged one paid real salvaged parts to make a piece of GEAR better,
// and that gear no longer goes in a slot — so the investment has to come back. In FULL, not at the 40%
// salvage recovery rate: they did not choose to melt it down, we changed what the item is.
//
// What it does, per (member, collection piece) with an enhancement:
//   1. re-derive the parts they spent from the same ramp the Forge charges (6, +4, +6, +8, cap +8)
//   2. credit those parts back at the piece's rarity tier
//   3. clear the enhancement row, so the piece is a plain trophy and cannot be double-refunded on a re-run
// Then it unequips every collection piece still sitting in a gear slot.
//
// Idempotent by construction: step 3 removes the row step 1 reads, so a second run finds nothing to pay.
//
// Usage: node scripts/collection-refund.mjs            (dry run — prints what it WOULD do)
//        node scripts/collection-refund.mjs --commit   (does it)
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const COMMIT = process.argv.includes("--commit");
const url = process.env.DATABASE_URL
    || fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("No DATABASE_URL");
const sql = neon(url);

// The catalog is the source of truth for BOTH lists — read it rather than re-typing ids that have already
// been wrong once in this session.
const setsSrc = fs.readFileSync(new URL("../src/lib/marketplace/sets.js", import.meta.url), "utf8");
const itemsSrc = fs.readFileSync(new URL("../src/lib/marketplace/items.js", import.meta.url), "utf8");
// PER SET BLOCK, not a lazy span. The first cut of this matched `collection: true` anywhere — including the
// words "collection: true" inside the doc comment at the top of sets.js — and then ran forward to the next
// `items: [` it could find, which belonged to the WARLORD set. The dry run printed executioner_axe and
// centurion_helm, i.e. it was about to refund parts for combat gear and unequip everybody's weapons.
// That is the entire reason this script has a dry run.
const IDS = (() => {
    // Split ITEM_SETS into one chunk per set literal, then keep the chunks that declare a collection.
    const chunks = setsSrc.split(/\n {4}\{/);
    const ids = [];
    for (const block of chunks) {
        if (!/id: "/.test(block) || !/collection: true/.test(block)) continue;
        const m = block.match(/items: \[([^\]]+)\]/);
        if (m) ids.push(...m[1].match(/"[^"]+"/g).map((x) => x.replace(/"/g, "")));
    }
    return ids;
})();
// 40 = the seven original collections (35) plus the Blacksmith's Regalia (5), converted 2026-08-06.
if (IDS.length !== 40) console.warn(`!! expected 40 collection pieces, parsed ${IDS.length} — check sets.js before committing`);

const RARITY = Object.fromEntries(
    [...itemsSrc.matchAll(/\{ id: "([^"]+)"[^\n]*?rarity: "([a-z]+)"/g)].map((m) => [m[1], m[2]])
);
// rarityTier from crafting.js — parts are tiered by the item's rarity.
const TIER = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, ascendant: 5, eternal: 5 };
const cost = (level) => { let q = 6; for (let k = 0; k < level; k += 1) q += Math.min(8, 4 + 2 * k); return q; };
const invested = (lvl) => { let t = 0; for (let l = 0; l < lvl; l += 1) t += cost(l); return t; };

console.log(`${IDS.length} collection pieces; mode: ${COMMIT ? "COMMIT" : "dry run"}`);

const rows = await sql`
  SELECT buyer_id, item_id, level FROM mkt_item_enhance
   WHERE item_id = ANY(${IDS}) AND level > 0 ORDER BY buyer_id`;
console.log(`forged collection pieces: ${rows.length}`);

let totalParts = 0;
for (const r of rows) {
    const tier = TIER[RARITY[r.item_id] || "rare"] || 2;
    const qty = invested(r.level);
    totalParts += qty;
    console.log(`  ${String(r.buyer_id).slice(0, 8)}  ${r.item_id.padEnd(20)} +${r.level}  ->  ${qty} tier-${tier} parts`);
    if (!COMMIT) continue;
    // Same table and the same upsert the Forge itself uses (addParts in crafting.js) — mkt_salvage_part,
    // column `count`. Writing to a table of my own invention is how a refund lands nowhere.
    await sql`INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES (${r.buyer_id}, ${tier}, ${qty})
              ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + ${qty}`;
    await sql`DELETE FROM mkt_item_enhance WHERE buyer_id = ${r.buyer_id} AND item_id = ${r.item_id}`;
    await sql`INSERT INTO mkt_craft_event (buyer_id, action, item_id, tier, meta)
              VALUES (${r.buyer_id}, 'collection_refund', ${r.item_id}, ${tier}, ${JSON.stringify({ level: r.level, parts: qty })}::jsonb)`;
}
console.log(`parts ${COMMIT ? "refunded" : "to refund"}: ${totalParts}`);

const eq = await sql`SELECT COUNT(*)::int AS n FROM mkt_user_equipment WHERE item_id = ANY(${IDS})`;
console.log(`collection pieces still in a gear slot: ${eq[0].n}`);
if (COMMIT && eq[0].n) {
    await sql`DELETE FROM mkt_user_equipment WHERE item_id = ANY(${IDS})`;
    console.log("unequipped — they stay owned, and owning is what pays now");
}
