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

const events = await sql`
    SELECT e.id, e.square_payment_id, e.square_order_id, e.sold_at, a.mystery_card_id AS card_id
      FROM mystery_sold_events e
      LEFT JOIN mystery_sold_assignments a ON a.sold_event_id = e.id
     WHERE e.square_payment_id IS NOT NULL
     ORDER BY e.sold_at`;
console.log(`${events.length} sold events with a payment id\n`);

const byBuyer = new Map();
let anon = 0;
for (const e of events) {
    const p = await fetch(`https://connect.squareup.com/v2/payments/${e.square_payment_id}`, { headers: H })
        .then((r) => r.json()).catch(() => null);
    const custId = p?.payment?.customer_id;
    if (!custId) { anon += 1; continue; }
    const c = await fetch(`https://connect.squareup.com/v2/customers/${custId}`, { headers: H })
        .then((r) => r.json()).catch(() => null);
    const cust = c?.customer || {};
    // Same three ways resolveBuyerId matches, in the same order.
    const [row] = await sql`
        SELECT id, coalesce(display_name, alias) AS who, coalesce(mystery_bags_bought,0) AS bags
          FROM mkt_buyer
         WHERE square_customer_id = ${custId}
            OR (${cust.email_address || null}::text IS NOT NULL AND lower(email) = lower(${cust.email_address || null}))
            OR (${cust.phone_number || null}::text IS NOT NULL AND phone = ${cust.phone_number || null})
         LIMIT 1`;
    if (!row) { anon += 1; continue; }
    if (!byBuyer.has(row.id)) byBuyer.set(row.id, { who: row.who, had: Number(row.bags), n: 0, best: 0 });
    const b = byBuyer.get(row.id);
    b.n += 1;
    if (e.card_id) {
        const [cd] = await sql`SELECT market_value FROM mystery_bag_cards WHERE id = ${e.card_id}`;
        b.best = Math.max(b.best, Number(cd?.market_value) || 0);
    }
}

for (const [, b] of byBuyer) {
    console.log(`  ${b.who.padEnd(20)} ${b.n} bag(s)${b.had ? ` (already had ${b.had})` : ""}${b.best >= BIG_HIT ? `  BIG HIT $${b.best}` : ""}`);
}
console.log(`\n${byBuyer.size} members creditable · ${anon} sales genuinely anonymous`);
if (!APPLY) { console.log("\nDRY RUN — pass --apply to write"); process.exit(0); }

const { syncEarnedBadges } = { syncEarnedBadges: null }; // badges re-sync on their next read; no import needed here
for (const [id, b] of byBuyer) {
    await sql`UPDATE mkt_buyer SET mystery_bags_bought = GREATEST(coalesce(mystery_bags_bought,0), ${b.n}) WHERE id = ${id}::uuid`;
    if (b.best >= BIG_HIT) await sql`UPDATE mkt_buyer SET mystery_big_hit = TRUE WHERE id = ${id}::uuid`;
    console.log(`credited ${b.who}`);
}
console.log("\ndone — badges re-sync on each member's next badge read");
