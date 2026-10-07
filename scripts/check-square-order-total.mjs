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
    { name: "Derek's order (ship)", sub: 17000, rate: 0.07375, ship: 619, fee: 595, credit: 0, expect: 17000 + 619 + Math.round((17000 + 619) * 0.07375) + 595 },
    { name: "pickup, no shipping", sub: 17000, rate: 0.07375, ship: 0, fee: 595, credit: 0, expect: 18849 },
    { name: "odd subtotal (rounding)", sub: 1999, rate: 0.07375, ship: 619, fee: 595, credit: 0, expect: 1999 + 619 + Math.round((1999 + 619) * 0.07375) + 595 },
];

let bad = 0;
for (const c of CASES) {
    const order = {
        location_id: locationId,
        line_items: [{ uid: "li-0", name: "Test item", quantity: "1", base_price_money: money(c.sub) }],
        ...(c.ship || c.fee ? {
            service_charges: [
                ...(c.ship ? [{ uid: "sc-ship", name: "Shipping", amount_money: money(c.ship), calculation_phase: "SUBTOTAL_PHASE", taxable: true }] : []),
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

// ── AND WHY AN ORDER CARRYING STORE CREDIT IS REFUSED ────────────────────────────────────────────────────────
// Square applies an ORDER discount to the line items BEFORE tax, so credit modelled that way shrinks the
// taxable base — under-collecting tax because somebody paid with credit, which is backwards. Spending a gift
// card does not make a purchase cheaper, it pays for it. createSquareShopOrder refuses rather than ship that,
// and this proves the reason still holds rather than asserting it in a comment.
{
    const base = { sub: 17000, rate: 0.07375, ship: 619, fee: 595 };
    const withCredit = {
        location_id: locationId,
        line_items: [{ uid: "li-0", name: "Test item", quantity: "1", base_price_money: money(base.sub) }],
        service_charges: [
            { uid: "sc-ship", name: "Shipping", amount_money: money(base.ship), calculation_phase: "SUBTOTAL_PHASE", taxable: true },
            { uid: "sc-fee", name: "Online processing fee", amount_money: money(base.fee), calculation_phase: "TOTAL_PHASE", taxable: false },
        ],
        taxes: [{ uid: "tax-1", name: "Sales Tax", percentage: String(base.rate * 100), type: "ADDITIVE", scope: "ORDER" }],
        discounts: [{ uid: "d", name: "Store credit", amount_money: money(2000), type: "FIXED_AMOUNT", scope: "ORDER" }],
    };
    const res = await sq("/orders/calculate", { order: withCredit });
    const taxWith = res?.order?.total_tax_money?.amount ?? -1;
    const taxCorrect = Math.round((base.sub + base.ship) * base.rate);
    const shrinks = taxWith < taxCorrect;
    if (!shrinks) bad += 1;
    console.log(`
  ${shrinks ? "ok  " : "FAIL"}  store credit as a discount shrinks the tax: $${(taxCorrect / 100).toFixed(2)} -> $${(taxWith / 100).toFixed(2)}`);
    console.log("          (which is why createSquareShopOrder refuses it and falls back to the lump charge)");
}

console.log(bad
    ? `\nFAIL — ${bad} case(s) disagree. Checkout would fall back to the lump charge for these.`
    : "\nOK — Square's own maths matches the cart to the cent, tax recorded as tax.");
process.exit(bad ? 1 : 0);
