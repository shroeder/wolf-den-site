// ── WHAT SALES TAX IS CHARGED ON ─────────────────────────────────────────────────────────────────────────────
// Luke: "lets make sure we pay and collect tax on shipping going forward."
//
// Minnesota taxes delivery charges on a taxable sale, so the base is the MERCHANDISE PLUS THE SHIPPING. It used
// to be merchandise alone, which under-collected on every shipped order.
//
// ⚠️ THIS FILE IS PURE, AND THAT IS THE WHOLE REASON IT EXISTS. The rule has FOUR consumers that must agree to
// the cent — the cart quotes it, the checkout recharges it against the rate the buyer actually picked, the
// buyer's own screen shows it, and Square is told the same thing so its order total matches the card charge.
// shop-pricing.js is `server-only` (it reads server env), so the browser could not import the rule from there
// and would have needed its own copy. A second copy of a tax calculation is how a checkout comes to display
// one number and charge another.
//
// The online processing fee is deliberately NOT in the base: it is a charge for using the website rather than
// part of the price of the goods. That one is genuinely arguable and was flagged to Luke rather than decided
// here.

export function shopTaxableBaseCents(subtotalCents, shippingCents = 0) {
    return Math.max(0, Math.round(Number(subtotalCents) || 0))
        + Math.max(0, Math.round(Number(shippingCents) || 0));
}

/** Tax on merchandise + shipping. `rate` is a decimal (0.07375), read live from Square by the caller. */
export function taxCentsFor(subtotalCents, rate, shippingCents = 0) {
    const r = Number(rate);
    const safe = Number.isFinite(r) && r >= 0 && r < 0.2 ? r : 0;
    return Math.round(shopTaxableBaseCents(subtotalCents, shippingCents) * safe);
}
