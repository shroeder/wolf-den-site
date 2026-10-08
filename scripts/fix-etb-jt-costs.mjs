// ── A HAND CORRECTION FOR TWO RUNS OF STOCK THAT BYPASSED THE RESTOCK FLOW ───────────────────────────────────
//
// Luke: "So 20 etbs 5 sold. Unit cost was 35 each. We should have used restock but didnt, so i need you to fix
// by setting unit cost in our internals or custom attribute in square for these units. 20 prismatic etbs. And
// journey together 6 booster boxes 95 unit cost."
//
// ⚠️ THE REPORT WAS NOT MISSING A COST, IT WAS CARRYING A WRONG ONE — which is the worse of the two, because a
// missing cost reads as a gap somebody chases and a wrong one reads as an answer. The Prismatic ETB
// (NL3JV2HP2WBAT2BNLOSCSMCE, selling at $99.99) carried $120.00 in wolfden_item_cost, sourced "restock", and
// that number came from a SINGLE unit bought on 28 September at $120 — one real purchase whose cost then stood
// in for every unit of a twenty-box run bought at $35. Hence a Pokemon Sealed category reading -20% on a day
// it actually made money.
//
// There are two separate places a cost lives and this writes BOTH, because they answer different questions:
//
//   wolfden_item_cost    what we paid per unit, durable, ours. Every sale line with no usable FIFO row falls
//                        back to this, so fixing it corrects the units ALREADY SOLD as well as the shelf.
//                        See the header of api/admin/item-costs for why this table exists at all.
//   cogs_ledger          the PURCHASE LOT: 20 units at $35 on a date. This is what FIFO stacks, and it is the
//                        only one of the two that can ever be exact — [[unit-cost-is-exact-fifo-never-averaged]]
//                        is Luke's standing ruling and a per-item average is explicitly not it.
//
// And it enqueues cost_sync, which is the only supported way to get a cost onto a Square item that already
// exists: Square's native unit cost is write-at-CREATE only and silently ignores updates (200, stores nothing).
//
// Run:  node scripts/fix-etb-jt-costs.mjs            dry run, writes nothing
//       node scripts/fix-etb-jt-costs.mjs --apply
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8")
    .match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!DB) throw new Error("no DATABASE_URL in accounting_app/.env");
const sql = neon(DB);

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();

const APPLY = process.argv.includes("--apply");

// ⚠️ THE DATE IS THE ONE THING THAT CANNOT BE GUESSED SAFELY, so it is derived rather than assumed: the lot is
// dated the day of the EARLIEST sale of that run, or today if nothing has sold. FIFO is an ordering — a lot
// dated after the sales it is meant to cost is invisible to them, and they would go on falling back for ever
// while this script reported success.
const LOTS = [
    {
        variationId: "NL3JV2HP2WBAT2BNLOSCSMCE",
        expectName: "Prismatic Evolutions Elite Trainer Box",
        units: 20,
        paidEach: 35.0,
    },
    {
        variationId: "5IBL53WQFXWWEW77VLBK3ILQ",
        expectName: "Pokémon Pokemon Sv9 Journey Together Booster Box",
        units: 6,
        paidEach: 95.0,
    },
];

const squareFetch = async (path, init = {}) => {
    if (!TOKEN) return null;
    const r = await fetch(`https://connect.squareup.com${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Square-Version": "2025-01-23",
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    if (!r.ok) { console.log(`   square ${path} -> ${r.status}`); return null; }
    return r.json();
};

/** Every sale of these variations in the last `days`, straight from Square — the same source FIFO uses. */
async function salesFor(ids, days = 75) {
    if (!TOKEN) return new Map();
    const loc = await squareFetch("/v2/locations");
    const locationIds = (loc?.locations || []).filter((l) => l.status === "ACTIVE").map((l) => l.id);
    if (!locationIds.length) return new Map();
    const begin = new Date(Date.now() - days * 864e5).toISOString();
    const out = new Map(ids.map((i) => [i, []]));
    let cursor;
    do {
        const page = await squareFetch("/v2/orders/search", {
            method: "POST",
            body: JSON.stringify({
                location_ids: locationIds,
                limit: 500,
                cursor,
                query: {
                    filter: { date_time_filter: { closed_at: { start_at: begin } }, state_filter: { states: ["COMPLETED"] } },
                    sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
                },
            }),
        });
        for (const o of page?.orders || []) {
            for (const li of o.line_items || []) {
                const id = li.catalog_object_id;
                if (!out.has(id)) continue;
                out.get(id).push({ at: o.closed_at || o.created_at, units: Number(li.quantity) || 0 });
            }
        }
        cursor = page?.cursor;
    } while (cursor);
    return out;
}

const money = (n) => `$${Number(n).toFixed(2)}`;

console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing is written. Add --apply.\n");

const ids = LOTS.map((l) => l.variationId);
const feed = new Map((await sql`
  SELECT variation_id, name, quantity, price FROM inventory_feed WHERE variation_id = ANY(${ids})`)
    .map((r) => [r.variation_id, r]));
const costs = new Map((await sql`
  SELECT variation_id, unit_cost_cents, source, updated_at FROM wolfden_item_cost WHERE variation_id = ANY(${ids})`)
    .map((r) => [r.variation_id, r]));
const sales = await salesFor(ids);

const plan = [];
for (const lot of LOTS) {
    const f = feed.get(lot.variationId);
    const c = costs.get(lot.variationId);
    const sold = sales.get(lot.variationId) || [];
    const soldUnits = sold.reduce((a, s) => a + s.units, 0);
    const first = sold.length ? sold[0].at : null;

    console.log(`── ${lot.expectName}`);
    console.log(`   variation   ${lot.variationId}`);
    console.log(`   in Square   ${f ? `"${f.name}"  qty ${f.quantity}  list ${money(f.price || 0)}` : "NOT IN THE FEED"}`);
    console.log(`   cost now    ${c ? `${money(c.unit_cost_cents / 100)}  (source ${c.source}, ${String(c.updated_at).slice(0, 10)})` : "none recorded"}`);
    console.log(`   cost after  ${money(lot.paidEach)}`);
    console.log(`   sold (75d)  ${soldUnits} units across ${sold.length} sales${first ? `, first ${String(first).slice(0, 10)}` : ""}`);

    const existing = await sql`
      SELECT id, occurred_on, product, quantity, paid_each FROM cogs_ledger WHERE variation_id = ${lot.variationId}`;
    console.log(`   lots now    ${existing.length ? existing.map((r) => `${r.quantity}x${money(r.paid_each)} on ${String(r.occurred_on).slice(0, 10)}`).join(", ") : "none — FIFO has nothing to stack, so every sale falls back"}`);

    // Dated to cover the sales it has to cost.
    const on = first ? String(new Date(first).toISOString()).slice(0, 10) : new Date().toISOString().slice(0, 10);
    console.log(`   new lot     ${lot.units} x ${money(lot.paidEach)} = ${money(lot.units * lot.paidEach)} dated ${on}`);

    // What the margin on what has already sold moves by.
    const was = c ? (c.unit_cost_cents / 100) * soldUnits : 0;
    const now = lot.paidEach * soldUnits;
    console.log(`   ⇒ COGS on the ${soldUnits} already sold: ${money(was)} → ${money(now)}  (${money(now - was)})`);
    console.log("");

    plan.push({ ...lot, on, soldUnits, name: f?.name || lot.expectName });
}

if (!APPLY) process.exit(0);

const SOURCE = "hand-fix-2026-10-08";

for (const p of plan) {
    // 1. The purchase lot, for FIFO.
    //    `entry_id` is left NULL deliberately: there is no ledger entry behind this — the money was handled
    //    outside the restock flow, which is the whole reason this script exists. source names it so the row is
    //    traceable to a hand correction rather than looking like an app write.
    //
    //    ⚠️ CHECKED FIRST, BECAUSE cogs_ledger HAS NO UNIQUE KEY WITHOUT AN entry_id. The ON CONFLICT clause
    //    insertCogs relies on is `(entry_id, product) WHERE entry_id IS NOT NULL`, so a row like this one can
    //    be inserted twice — and two 20-box lots at $35 is a phantom $700 of inventory that FIFO will happily
    //    spend. This script failed half way through on its first run (a wrong cost_sync column), so being
    //    re-runnable is not hypothetical here.
    const [dupe] = await sql`
      SELECT id FROM cogs_ledger
       WHERE variation_id = ${p.variationId} AND source = ${SOURCE}
         AND quantity = ${p.units} AND paid_each = ${p.paidEach} LIMIT 1`;
    if (dupe) {
        console.log(`lot already present: cogs_ledger #${dupe.id}  ${p.units} x ${money(p.paidEach)}  ${p.name} — skipped`);
    } else {
        const [row] = await sql`
          INSERT INTO cogs_ledger (occurred_on, product, quantity, paid_each, paid_total, variation_id, source)
          VALUES (${p.on}, ${p.name}, ${p.units}, ${p.paidEach}, ${p.units * p.paidEach}, ${p.variationId}, ${SOURCE})
          RETURNING id`;
        console.log(`lot written: cogs_ledger #${row.id}  ${p.units} x ${money(p.paidEach)}  ${p.name}`);
    }

    // 2. The durable per-unit cost, which is what every uncosted sale line falls back to.
    await sql`
      INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name)
      VALUES (${p.variationId}, ${Math.round(p.paidEach * 100)}, 'hand-fix', ${p.name})
      ON CONFLICT (variation_id) DO UPDATE
        SET unit_cost_cents = EXCLUDED.unit_cost_cents, source = EXCLUDED.source,
            item_name = COALESCE(EXCLUDED.item_name, wolfden_item_cost.item_name), updated_at = NOW()`;
    console.log(`cost written: ${money(p.paidEach)} on ${p.variationId}`);

    // 3. Queue it for Square. Square's native cost cannot be updated after creation, so this is the
    //    reconciler's job and it reports whether it got there — see cost-sync.
    //    ⚠️ desired_cost IS IN CENTS and the columns are not the ones you would guess — this script's first
    //    run died here on `unit_cost_cents`, which is wolfden_item_cost's column name, not this table's. The
    //    shape mirrors enqueueCostSync in lib/cogs/cost-sync.js, which is the real writer.
    await sql`
      INSERT INTO cost_sync (variation_id, item_name, desired_cost, state, attempts, last_error)
      VALUES (${p.variationId}, ${p.name}, ${Math.round(p.paidEach * 100)}, 'pending', 0, NULL)
      ON CONFLICT (variation_id) DO UPDATE
        SET item_name = COALESCE(EXCLUDED.item_name, cost_sync.item_name),
            desired_cost = EXCLUDED.desired_cost, state = 'pending', attempts = 0, last_error = NULL`;
    console.log(`queued for Square: ${p.variationId}  (${money(p.paidEach)})`);
}

console.log("\nDone. Run scripts/fifo-plan.mjs next to see what FIFO re-costs, then apply the reconcile.");
