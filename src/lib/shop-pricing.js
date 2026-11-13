import "server-only";

import { taxCentsFor } from "@/lib/shop-tax-base";
import { bandedShippingCents, OWN_SHIPPING } from "@/lib/shipping/own-shipping";
import { parcelEstimate } from "@/lib/shipping/easypost";

// Tax + shipping for the online shop.
//
// TAX: the rate is read live from Square (getShopSalesTaxRate in consignment/square.js) so online
// orders match the counter automatically — no number to keep in sync. Callers pass that rate in here.
// Set env SHOP_TAX_RATE (decimal, e.g. "0.07375") only to force/override the Square value.
//
// SHIPPING: banded on the parcel's ESTIMATED WEIGHT — the table lives in shipping/own-shipping.js, which is
// pure so the cart, the checkout, the buyer's screen and Square all read one copy of it. Two env knobs
// survive as overrides:
//   SHOP_SHIPPING_FLAT_CENTS  e.g. "599"    one flat number, wins over the table (for a promotion)
//   SHOP_FREE_SHIP_OVER_CENTS e.g. "10000"  free over $100; 0/unset = never. Read the note on the function.

export function shopTaxRate() {
    const raw = Number(process.env.SHOP_TAX_RATE);
    return Number.isFinite(raw) && raw >= 0 && raw < 0.2 ? raw : 0.06875; // MN state base as fallback
}

// The taxable base (merchandise + shipping) lives in shop-tax-base.js, which is PURE — the buyer's cart screen
// has to apply the identical rule and cannot import this file, because this one is server-only.
export function shopTaxCents(subtotalCents, rate = shopTaxRate(), shippingCents = 0) {
    const effectiveRate = Number.isFinite(rate) && rate >= 0 && rate < 0.2 ? rate : shopTaxRate();
    return taxCentsFor(subtotalCents, effectiveRate, shippingCents);
}

/**
 * What to charge for postage.
 *
 * ⚠️ IT TAKES THE ITEMS NOW, AND A FLAT RATE WAS NEVER GOING TO WORK. The old signature could only see the
 * order's MONEY, and postage is priced on its WEIGHT — those two come apart hardest exactly where it costs
 * most: four $28 poster collections are $112 of merchandise and nearly four pounds of parcel, while a $450
 * order of singles fits in an envelope. The flat $5.99 fallback would have undercharged the poster order by
 * more than the old EasyPost rate did.
 *
 * `items` is optional so an old caller cannot crash, but omitting it costs money — with no items there is no
 * weight, and bandedShippingCents deliberately fails to the TOP band rather than the bottom.
 */
export function shopShippingCents(subtotalCents, fulfillmentMode, items = null) {
    if (fulfillmentMode !== "shipping") {
        return 0;
    }
    // ⚠️ FREE SHIPPING IS STILL CHECKED FIRST AND IS STILL OFF BY DEFAULT. Worth knowing before switching it
    // on: the biggest order in the shop's history ($1,199.97) collected $10.90 of postage on a parcel this
    // table prices at $25, so a threshold set low enough to catch orders like that one is the shop paying
    // the whole freight on its most valuable baskets.
    const freeOver = Number(process.env.SHOP_FREE_SHIP_OVER_CENTS);
    if (Number.isFinite(freeOver) && freeOver > 0 && (Number(subtotalCents) || 0) >= freeOver) {
        return 0;
    }
    // The escape hatch stays: a flat override still wins, for the day a promotion needs one number.
    const flat = Number(process.env.SHOP_SHIPPING_FLAT_CENTS);
    if (Number.isFinite(flat) && flat >= 0) return flat;

    if (OWN_SHIPPING) {
        // ⚠️ NO ITEMS STILL GOES THROUGH THE BAND LOOKUP, and that is the whole point of it failing upward.
        // The first version returned the old $5.99 here, which made the "fails upward" note on
        // bandedShippingCents a lie in the exact case it was written for: a caller that forgot the items got
        // the CHEAPEST answer in the file. Handing it a zero weight gets the dearest one instead, which is
        // the direction a shop that has undercharged thirteen times in a row should fall.
        const oz = Array.isArray(items) && items.length ? parcelEstimate(items).weight : 0;
        return bandedShippingCents(oz);
    }
    return 599;
}
