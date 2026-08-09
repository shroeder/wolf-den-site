// TRADED SINGLES: what we paid is in the TRADE LEDGER, not in Square.
//
// Square never knew the cost of a traded card. Intake through the trade tool records the card's market value
// and the buy rate we paid at, and that is the whole truth of what it cost us — `unit_market × buy_rate_percent`.
// It just lived in trade_line and was never joined to the sold line item, so a traded single always reported
// as pure profit even before anything was deleted.
//
// Run:  node scripts/capture-trade-costs.mjs [--dry]
//
// Only fills GAPS. A cost from Square or from the COGS export is left alone; this is for the singles that
// nothing else can price. Idempotent.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!DB) throw new Error("no DATABASE_URL");
const sql = neon(DB);
const DRY = process.argv.includes("--dry");

// One row per variation. A card traded in more than once is costed at its most RECENT buy — that is the
// inventory we are most likely still holding and selling, and averaging across months of moving card prices
// would invent a number that was never paid on any actual trade.
const rows = await sql`
    SELECT DISTINCT ON (tl.square_variation_id)
           tl.square_variation_id AS variation_id,
           tl.item_name,
           tl.unit_market,
           tl.buy_rate_percent,
           t.traded_at
      FROM trade_line tl
      JOIN trade t ON t.id = tl.trade_id
     WHERE tl.direction = 'IN'
       AND tl.square_variation_id IS NOT NULL
       AND tl.unit_market IS NOT NULL
       AND tl.buy_rate_percent IS NOT NULL
     ORDER BY tl.square_variation_id, t.traded_at DESC, tl.id DESC`;

const existing = new Set((await sql`SELECT variation_id FROM wolfden_item_cost`).map((r) => r.variation_id));

const writes = [];
let skipped = 0;
for (const r of rows) {
    if (existing.has(r.variation_id)) { skipped += 1; continue; }
    const cents = Math.round(Number(r.unit_market) * (Number(r.buy_rate_percent) / 100) * 100);
    if (!(cents > 0)) continue;
    writes.push({ id: r.variation_id, cents, name: r.item_name, market: Number(r.unit_market), rate: Number(r.buy_rate_percent) });
}
console.log(`trade lines with a variation + rate: ${rows.length}`);
console.log(`already costed from a better source, left alone: ${skipped}`);
console.log(`NEW costs from the trade ledger: ${writes.length}`);
writes.slice(0, 10).forEach((w) => console.log(`  ${String(w.name).slice(0, 40).padEnd(40)} $${w.market.toFixed(2)} @ ${w.rate}%  →  $${(w.cents / 100).toFixed(2)}`));
if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }

for (const w of writes) {
    await sql`
        INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name)
        VALUES (${w.id}, ${w.cents}, 'trade_ledger', ${w.name})
        ON CONFLICT (variation_id) DO NOTHING`;
}
const [tot] = await sql`SELECT COUNT(*) n FROM wolfden_item_cost`;
console.log(`\nwrote ${writes.length}; table now holds ${tot.n} costs`);
