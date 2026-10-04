import fs from "fs";
import { neon } from "@neondatabase/serverless";
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

// A map applied at sea is spent by the NEXT LANDING. The markers for a landing having happened are the
// three things you can only do ashore: dig, meet the merchant, buy from him. A map use that happens while
// a previous one is still pending — no landing in between — is the overwritten one.
const CLEAR = new Set(["sail_dig", "sail_merchant", "sail_merchant_buy"]);

const rows = await sql`
  SELECT COALESCE(b.display_name, '(' || LEFT(e.buyer_id::text, 8) || ')') AS who, e.buyer_id, e.event, e.created_at
    FROM mkt_activity_event e JOIN mkt_buyer b ON b.id = e.buyer_id
   WHERE (e.event = 'use_consumable' AND e.meta->>'id' = 'sail_treasure_map')
      OR e.event IN ('sail_dig', 'sail_merchant', 'sail_merchant_buy')
   ORDER BY e.buyer_id, e.created_at`;

const by = new Map();
for (const r of rows) {
  if (!by.has(r.buyer_id)) by.set(r.buyer_id, { who: r.who, ev: [] });
  by.get(r.buyer_id).ev.push(r);
}
const owed = [];
for (const [id, { who, ev }] of by) {
  let pending = 0, lost = 0, used = 0;
  for (const r of ev) {
    if (r.event === "use_consumable") { used++; if (pending > 0) lost++; else pending = 1; }
    else if (CLEAR.has(r.event)) pending = 0;
  }
  if (used) console.log(`  ${who.padEnd(18)} used ${String(used).padStart(3)}  overwritten ${lost}`);
  if (lost > 0) owed.push({ id, who, lost });
}
console.log("\nTOTAL overwritten:", owed.reduce((s, o) => s + o.lost, 0), "across", owed.length, "members");
fs.writeFileSync("scripts/_map-owed.json", JSON.stringify(owed, null, 2));

// ── THE REFUND ───────────────────────────────────────────────────────────────────────────────────────────
// Pass --pay to actually hand the maps back. The owner's own row is excluded: 12 of the 26 are mine, from
// testing this feature, and paying myself back out of a members' correction would be the wrong kind of tidy.
if (process.argv.includes("--pay")) {
  const OWNER = "The Wolf Den";
  const pay = owed.filter((o) => o.who !== OWNER);
  for (const o of pay) {
    await sql`INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count)
              VALUES (${o.id}, 'sail_treasure_map', ${o.lost})
              ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + ${o.lost}`;
    console.log(`  paid ${o.who}: +${o.lost}`);
  }
  console.log("refunded", pay.reduce((s, o) => s + o.lost, 0), "maps to", pay.length, "members");
}
