// Credit every mystery-bag sale that was never attributed to a member.
//
// THE BUG. attributeMysteryPull looked for the buyer on the Square ORDER (and later its tenders), and Square
// puts them on the PAYMENT. So the counter it maintains — mkt_buyer.mystery_bags_bought — is 0 for every
// member in the database, and the "Grab Bagger" badge (buy one bag) has never been earnable by anyone. A
// member bought a bag today, went looking for the badge and found 0/1.
//
// This reconstructs the credit from mystery_sold_events, which kept the payment id all along.
//
// Idempotent: it counts the sales it can attribute per member and writes that as the FLOOR, so re-running
// cannot inflate anybody, and a member already credited above the reconstructed number is left alone.
//
// --apply to write; default is a dry run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const sql = neon(readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim());
const TOKEN = readFileSync("../accounting_app/local.properties", "utf8").match(/^SQUARE_ACCESS_TOKEN=(.+)$/m)[1].trim();
const H = { Authorization: `Bearer ${TOKEN}`, "Square-Version": "2025-01-23" };
const BIG_HIT = 100;

// ── TWO SOURCES, CLAIM FIRST ─────────────────────────────────────────────────────────────────────────────────
// The QR claim is the better evidence and by a wide margin: 32 sales have one against 6 that carried a Square
// customer the terminal happened to attach. Scanning the code is a thing the member chose to do; the customer
// on the payment is a by-product of how it was rung up, and is sometimes somebody else entirely.
const claimed = await sql`
    SELECT c.redeemed_buyer_id AS buyer_id, coalesce(b.display_name, b.alias) AS who,
           count(*)::int AS bags, max(coalesce(cd.market_value, 0))::numeric AS best
      FROM mystery_sold_events e
      JOIN mkt_loyalty_claim c ON c.square_payment_id = e.square_payment_id
      JOIN mkt_buyer b ON b.id = c.redeemed_buyer_id
      LEFT JOIN mystery_sold_assignments a ON a.sold_event_id = e.id
      LEFT JOIN mystery_bag_cards cd ON cd.id = a.mystery_card_id
     WHERE c.redeemed_buyer_id IS NOT NULL
     GROUP BY 1, 2`;

const tally = new Map();
for (const r of claimed) tally.set(r.buyer_id, { who: r.who, bags: r.bags, best: Number(r.best) || 0, via: "claim" });

// Then the Square customer on the payment, for sales with no claim behind them.
const unclaimed = await sql`
    SELECT e.id, e.square_payment_id, a.mystery_card_id
      FROM mystery_sold_events e
      LEFT JOIN mkt_loyalty_claim c ON c.square_payment_id = e.square_payment_id AND c.redeemed_buyer_id IS NOT NULL
      LEFT JOIN mystery_sold_assignments a ON a.sold_event_id = e.id
     WHERE e.square_payment_id IS NOT NULL AND c.square_payment_id IS NULL`;
let anon = 0;
for (const e of unclaimed) {
    const p = await fetch(`https://connect.squareup.com/v2/payments/${e.square_payment_id}`, { headers: H }).then((r) => r.json()).catch(() => null);
    const custId = p?.payment?.customer_id;
    if (!custId) { anon += 1; continue; }
    const c = await fetch(`https://connect.squareup.com/v2/customers/${custId}`, { headers: H }).then((r) => r.json()).catch(() => null);
    const cu = c?.customer || {};
    const [row] = await sql`
        SELECT id, coalesce(display_name, alias) AS who FROM mkt_buyer
         WHERE square_customer_id = ${custId}
            OR (${cu.email_address || null}::text IS NOT NULL AND lower(email) = lower(${cu.email_address || null}))
            OR (${cu.phone_number || null}::text IS NOT NULL AND phone = ${cu.phone_number || null})
         LIMIT 1`;
    if (!row) { anon += 1; continue; }
    if (!tally.has(row.id)) tally.set(row.id, { who: row.who, bags: 0, best: 0, via: "square" });
    const t = tally.get(row.id);
    t.bags += 1;
    if (e.mystery_card_id) {
        const [cd] = await sql`SELECT market_value FROM mystery_bag_cards WHERE id = ${e.mystery_card_id}`;
        t.best = Math.max(t.best, Number(cd?.market_value) || 0);
    }
}

for (const [, t] of [...tally].sort((a, b) => b[1].bags - a[1].bags)) {
    console.log(`  ${t.who.padEnd(20)} ${String(t.bags).padStart(2)} bag(s)  via ${t.via}${t.best >= BIG_HIT ? `  BIG HIT $${t.best}` : ""}`);
}
console.log(`
${tally.size} members creditable · ${anon} sales genuinely anonymous (no claim, no matchable customer)`);
if (!APPLY) { console.log("\nDRY RUN — pass --apply to write"); process.exit(0); }

for (const [id, t] of tally) {
    await sql`UPDATE mkt_buyer SET mystery_bags_bought = GREATEST(coalesce(mystery_bags_bought,0), ${t.bags}) WHERE id = ${id}::uuid`;
    if (t.best >= BIG_HIT) await sql`UPDATE mkt_buyer SET mystery_big_hit = TRUE WHERE id = ${id}::uuid`;
    console.log(`credited ${t.who} -> ${t.bags}`);
}
console.log("\ndone — badges re-sync on each member's next read");
