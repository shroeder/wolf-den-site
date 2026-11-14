// ── PUT THE REAL TRACKING NUMBER BACK ON AN ORDER ───────────────────────────────────────────────────────────
// A mis-scanned label saved the customer's own ZIP+4 glued to a truncated tracking number — see
// scripts/test-tracking-scan.mjs for the defect, now fixed. This repairs the rows it already wrote.
//
// ⚠️ THE TRUE NUMBER CANNOT BE RECONSTRUCTED FROM THE BROKEN ONE. The bad value is four digits of ZIP
// followed by the first eighteen of the real number: the last four digits of the truth were pushed off the
// end and are simply gone. Guessing them would hand a customer a second number that does not track, which
// is worse than the first. So the number comes from EasyPost, which sold the label and is the only place
// that still knows — `easypost_shipment_id` is on the order row.
//
//   EASYPOST_API_KEY=... node --experimental-loader ./scripts/lib/app-loader.mjs scripts/fix-order-tracking.mjs
//        → audits every shipped order, prints what is wrong and what EasyPost says it should be
//
//   ... scripts/fix-order-tracking.mjs --apply
//        → writes the corrected numbers, and ONLY those that pass the USPS check digit
//
// ⚠️ IT DOES NOT EMAIL ANYBODY. Re-sending a shipping notification is a separate decision with a customer
// on the other end of it, and this script deliberately does not make it. Fix the number, then reply.
import { db } from "@/lib/db";
import { uspsCheckOk } from "@/lib/shipping/tracking-scan.js";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.EASYPOST_API_KEY;

const rows = await db.query(
    `SELECT id, LEFT(id::text, 8) AS ref, tracking_number, easypost_shipment_id, shipping_carrier,
            shipping_postal_code, customer_name, customer_email, fulfilled_at
       FROM shop_orders
      WHERE tracking_number IS NOT NULL AND tracking_number <> ''
      ORDER BY fulfilled_at`,
).catch(() => []);

console.log(`${rows.length} shipped orders with a tracking number\n`);

const broken = rows.filter((o) => {
    const t = String(o.tracking_number).replace(/\D/g, "");
    // Only USPS shapes are checkable here; a UPS 1Z has its own digit and its own branch.
    if (!/^(9[1-5]|03|70|23)\d+$/.test(t) || (t.length !== 22 && t.length !== 20)) return false;
    return !uspsCheckOk(t);
});

if (!broken.length) { console.log("every USPS tracking number passes its check digit — nothing to repair."); process.exit(0); }

for (const o of broken) {
    const zip = String(o.shipping_postal_code || "");
    const t = String(o.tracking_number);
    console.log(`#${String(o.ref).toUpperCase()}  ${o.customer_name}  (${o.customer_email})`);
    console.log(`   stored:   ${t}   ✗ fails the USPS check digit`);
    console.log(`   ships to: ${zip}${t.slice(0, 4) === `${zip}`.slice(0, 4) || /^9/.test(t) ? `   — the number starts ${t.slice(0, 4)}, which is a ZIP+4 shape` : ""}`);

    if (!KEY) { console.log(`   ⚠️ no EASYPOST_API_KEY in the environment — cannot look up the truth\n`); continue; }
    if (!o.easypost_shipment_id) { console.log(`   ⚠️ no easypost_shipment_id on this order — the label was not bought here\n`); continue; }

    const r = await fetch(`https://api.easypost.com/v2/shipments/${o.easypost_shipment_id}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${KEY}:`).toString("base64")}` },
    }).then((x) => x.json()).catch((e) => ({ error: String(e) }));

    const truth = r?.tracking_code || null;
    if (!truth) { console.log(`   ⚠️ EasyPost returned no tracking_code: ${JSON.stringify(r?.error || r).slice(0, 160)}\n`); continue; }

    const good = uspsCheckOk(truth);
    console.log(`   EasyPost: ${truth}   ${good ? "✓ validates" : "✗ ALSO fails — do not write this"}`);
    if (!good) { console.log(""); continue; }
    if (truth === t) { console.log(`   already correct\n`); continue; }

    if (!APPLY) { console.log(`   would update (pass --apply)\n`); continue; }
    await db.query(`UPDATE shop_orders SET tracking_number = $1 WHERE id = $2`, [truth, o.id]);
    console.log(`   ✓ updated\n`);
}

if (!APPLY) console.log("audit only — pass --apply to write the corrected numbers.");
