import "server-only";

// Tax + shipping for the online shop.
//
// TAX: the rate is read live from Square (getShopSalesTaxRate in consignment/square.js) so online
// orders match the counter automatically — no number to keep in sync. Callers pass that rate in here.
// Set env SHOP_TAX_RATE (decimal, e.g. "0.07375") only to force/override the Square value.
//
// SHIPPING: env-configurable so the owner sets the exact numbers without a code change:
//   SHOP_SHIPPING_FLAT_CENTS  e.g. "599"    ($5.99 flat shipping)
//   SHOP_FREE_SHIP_OVER_CENTS e.g. "10000"  (free shipping over $100; 0/unset = never)

export function shopTaxRate() {
    const raw = Number(process.env.SHOP_TAX_RATE);
    return Number.isFinite(raw) && raw >= 0 && raw < 0.2 ? raw : 0.06875; // MN state base as fallback
}

export function shopTaxCents(subtotalCents, rate = shopTaxRate()) {
    const effectiveRate = Number.isFinite(rate) && rate >= 0 && rate < 0.2 ? rate : shopTaxRate();
    return Math.round((Number(subtotalCents) || 0) * effectiveRate);
}

export function shopShippingCents(subtotalCents, fulfillmentMode) {
    if (fulfillmentMode !== "shipping") {
        return 0;
    }
    const freeOver = Number(process.env.SHOP_FREE_SHIP_OVER_CENTS);
    if (Number.isFinite(freeOver) && freeOver > 0 && (Number(subtotalCents) || 0) >= freeOver) {
        return 0;
    }
    const flat = Number(process.env.SHOP_SHIPPING_FLAT_CENTS);
    return Number.isFinite(flat) && flat >= 0 ? flat : 599; // $5.99 fallback
}
