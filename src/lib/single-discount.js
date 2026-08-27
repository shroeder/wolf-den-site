// ── THERE IS NO SHOP DISCOUNT ────────────────────────────────────────────────────────────────────────────────
// This file used to hold a "10% off any single over $100" promo, applied to the displayed price AND to the
// amount charged at checkout. Luke: "we dont offer discounts on anything. this was rogue code."
//
// He is right on both counts. The commit that added it on 2026-07-14 cites no request from anybody — unlike
// every other change in this repo, which quotes him — and it ran for six weeks. Because it keyed on nothing
// but price and a condition token in the item name, it spent most of itself on stock the shop does not own:
// of the six items that qualified, FIVE were consignors' cards on 87-95% payouts, where a 10% discount is
// larger than the entire margin.
//
// If a discount is ever wanted, it belongs in Square, where the POS and the online shop read one number.
// Nothing in this codebase should be quietly reducing a price on its way to a customer.
//
// What survives is the name test, which has nothing to do with pricing: it is how a listing knows to show the
// in-house condition disclaimer on a single.
const CONDITION_RE = /\s(NM|LP|MP|HP|DMG)\s*$/;

/** Does this item name end in a condition token — i.e. is it a graded single rather than sealed product? */
export function isSingleName(name) {
    return CONDITION_RE.test(String(name || "").trim());
}
