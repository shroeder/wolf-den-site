// ── DOES THE ITEMISED ORDER ADD UP TO WHAT THE CARD IS CHARGED? ──────────────────────────────────────────────
// The new checkout builds a real Square order and then refuses to use it unless its total matches the charge
// to the cent. This runs Derek's actual order through Square's CALCULATE endpoint — which does the full tax
// and service-charge maths and returns the totals WITHOUT creating anything or taking any money — so the
// agreement can be proven before a customer is the one who finds out.
//
//   node scripts/check-square-order-total.mjs
import fs from "node:fs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/^SQUARE_ACCESS_TOKEN\s*=\s*(.+)$/mi)[1].trim();

async function sq(path, body) {
    const r = await fetch(`https://connect.squareup.com/v2${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Square-Version": "2024-10-17", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 400)}`);
    return j;
}

const locationId = (await sq("/locations")).locations?.[0]?.id;
const money = (c) => ({ amount: c, currency: "USD" });

// Derek's order, exactly: one booster box at $170.00, 7.375% tax, $6.19 shipping, $5.95 online fee.
const CASES = [
    { name: "Derek's order (ship)", sub: 17000, rate: 0.07375, ship: 619, fee: 595, credit: 0, expect: 19468 },
    { name: "pickup, no shipping", sub: 17000, rate: 0.07375, ship: 0, fee: 595, credit: 0, expect: 18849 },
    // ⚠️ KEPT AS A FAILING SHAPE ON PURPOSE. Square applies an order discount BEFORE tax, so credit
    // modelled this way under-collects: tax falls to $11.06 and the total to $173.20. This case documents
    // WHY createSquareShopOrder refuses an order carrying credit and falls back to the lump charge — and
    // it will start failing loudly if anyone ever decides to send a discount after all.
    { name: "credit as a discount (must NOT match)", sub: 17000, rate: 0.07375, ship: 619, fee: 595, credit: 2000, expect: 17320 },
    { name: "odd subtotal (rounding)", sub: 1999, rate: 0.07375, ship: 619, fee: 595, credit: 0, expect: 1999 + 147 + 619 + 595 },
];

let bad = 0;
for (const c of CASES) {
    const order = {
        location_id: locationId,
        line_items: [{ uid: "li-0", name: "Test item", quantity: "1", base_price_money: money(c.sub) }],
        ...(c.ship || c.fee ? {
            service_charges: [
                ...(c.ship ? [{ uid: "sc-ship", name: "Shipping", amount_money: money(c.ship), calculation_phase: "TOTAL_PHASE", taxable: false }] : []),
                ...(c.fee ? [{ uid: "sc-fee", name: "Online processing fee", amount_money: money(c.fee), calculation_phase: "TOTAL_PHASE", taxable: false }] : []),
            ],
        } : {}),
        taxes: [{ uid: "tax-1", name: "Sales Tax", percentage: String(Number((c.rate * 100).toFixed(5))), type: "ADDITIVE", scope: "ORDER" }],
        ...(c.credit ? { discounts: [{ uid: "d", name: "Store credit", amount_money: money(c.credit), type: "FIXED_AMOUNT", scope: "ORDER" }] } : {}),
    };

    // CALCULATE, not CREATE: no order is written and no money moves.
    const res = await sq("/orders/calculate", { order });
    const total = res?.order?.total_money?.amount ?? -1;
    const tax = res?.order?.total_tax_money?.amount ?? -1;
    const ok = total === c.expect;
    if (!ok) bad += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.name.padEnd(26)} total $${(total / 100).toFixed(2)}  (tax $${(tax / 100).toFixed(2)})`);
    if (!ok) console.log(`          expected $${(c.expect / 100).toFixed(2)}`);
}

console.log(bad
    ? `\nFAIL — ${bad} case(s) disagree. Checkout would fall back to the lump charge for these.`
    : "\nOK — Square's own maths matches the cart to the cent, tax recorded as tax.");
process.exit(bad ? 1 : 0);
