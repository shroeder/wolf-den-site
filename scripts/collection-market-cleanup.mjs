// ── COLLECTION PIECES OUT OF THE MARKET ──────────────────────────────────────────────────────────────────────
// Collection pieces pay their bonus for being OWNED, so parting with one silently deletes a permanent upgrade.
// Selling and salvaging were closed when they stopped being gear; the two paths that still moved one between
// members — the auction house and player trades — are closed now too (auction.js / trade.js).
//
// Anything already in flight when that landed has to be undone by hand, which is this:
//   • active auction listings  → cancelled, the piece handed back to the seller, the listing fee returned
//   • pending trade offers     → voided, the proposer's escrowed gold refunded
//
// Idempotent: it only touches ACTIVE listings and PENDING offers, so a second run finds nothing. Dry by
// default — pass --apply to write.
//
//   node scripts/collection-market-cleanup.mjs            (dry run)
//   node scripts/collection-market-cleanup.mjs --apply
//
// DATABASE_URL comes from the environment (see the deploy notes); nothing here reads a local .env.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const sql = neon(url);

// The ids are PARSED out of sets.js rather than pasted here, for the same reason the refund script does it: a
// second hand-maintained list is a second thing to forget when a set gains a piece. Per SET BLOCK, and with a
// count assertion, because the first version of that parser matched the words "collection: true" in a comment
// and ran on into the next set's items — it was about to unequip everybody's weapons.
function collectionItemIds() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "..", "src", "lib", "marketplace", "sets.js"), "utf8");
    const ids = [];
    // Split on set-object boundaries, keep only blocks that declare collection: true, take that block's items.
    for (const block of src.split(/\n\s{4}\{/)) {
        if (!/\bcollection:\s*true/.test(block)) continue;
        const m = block.match(/items:\s*\[([^\]]+)\]/);
        if (!m) continue;
        for (const raw of m[1].split(",")) {
            const id = raw.trim().replace(/^["']|["']$/g, "");
            if (id) ids.push(id);
        }
    }
    return [...new Set(ids)];
}

const IDS = collectionItemIds();
// 40 = the seven original collections (35) plus the Blacksmith's Regalia (5), converted 2026-08-06.
if (IDS.length !== 40) {
    console.error(`Refusing to run: parsed ${IDS.length} collection ids, expected 40. Did a set gain a piece?`);
    console.error(IDS.join(", "));
    process.exit(1);
}
console.log(`${IDS.length} collection ids parsed from sets.js`);
console.log(APPLY ? "APPLY — writing changes" : "DRY RUN — nothing will be written (pass --apply)");

// ── Auctions ────────────────────────────────────────────────────────────────────────────────────────────────
const listings = await sql`
    SELECT a.id, a.seller_id, a.item_id, a.price, COALESCE(NULLIF(b.display_name,''), b.alias) AS who
      FROM mkt_auction a JOIN mkt_buyer b ON b.id = a.seller_id
     WHERE a.item_id = ANY(${IDS}) AND a.status = 'active'`;
console.log(`\nActive listings holding a collection piece: ${listings.length}`);
for (const l of listings) {
    console.log(`   #${l.id} ${l.item_id} — ${l.who} @ ${l.price}`);
    if (!APPLY) continue;
    const cancelled = await sql`UPDATE mkt_auction SET status = 'cancelled' WHERE id = ${l.id} AND status = 'active' RETURNING id`;
    if (!cancelled.length) { console.log("      (already resolved, skipped)"); continue; }
    // Hand the piece back. mkt_user_item is one row per (buyer, item) — the seller may have re-acquired one.
    await sql`INSERT INTO mkt_user_item (buyer_id, item_id, acquired_via, charges_left)
              VALUES (${l.seller_id}, ${l.item_id}, 'auction_return', 0)
              ON CONFLICT (buyer_id, item_id) DO NOTHING`;
    // The listing fee was charged up front and the sale never happened, so it goes back too.
    const fee = Math.max(1, Math.ceil(Number(l.price) * 0.05));
    await sql`UPDATE mkt_buyer SET gold = gold + ${fee} WHERE id = ${l.seller_id}`;
    console.log(`      returned ${l.item_id} + ${fee} gold listing fee`);
}

// ── Trades ──────────────────────────────────────────────────────────────────────────────────────────────────
const offers = await sql`
    SELECT id, from_buyer_id, offered_items, requested_items, COALESCE(offered_gold, 0) AS offered_gold
      FROM mkt_trade_offer WHERE status = 'pending'`;
const hit = offers.filter((o) => [...(o.offered_items || []), ...(o.requested_items || [])].some((id) => IDS.includes(id)));
console.log(`\nPending offers containing a collection piece: ${hit.length} (of ${offers.length} pending)`);
for (const o of hit) {
    console.log(`   ${o.id} offered=${JSON.stringify(o.offered_items)} requested=${JSON.stringify(o.requested_items)} escrow=${o.offered_gold}`);
    if (!APPLY) continue;
    const voided = await sql`UPDATE mkt_trade_offer SET status='void', resolved_at=NOW() WHERE id = ${o.id} AND status='pending' RETURNING id`;
    if (!voided.length) { console.log("      (already resolved, skipped)"); continue; }
    if (Number(o.offered_gold) > 0) {
        await sql`UPDATE mkt_buyer SET gold = gold + ${Number(o.offered_gold)} WHERE id = ${o.from_buyer_id}`;
        console.log(`      voided + refunded ${o.offered_gold} gold escrow`);
    } else console.log("      voided (no escrow)");
}

console.log(APPLY ? "\nDone." : "\nDry run complete — re-run with --apply to write.");
