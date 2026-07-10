import "server-only";

// Tax + shipping for the online shop. Rates are env-configurable so the owner sets the exact numbers
// without a code change. Defaults are sensible-but-placeholder — SET THESE before going live:
//   SHOP_TAX_RATE            e.g. "0.07375"  (Montgomery, MN combined rate — decimal)
//   SHOP_SHIPPING_FLAT_CENTS e.g. "599"      ($5.99 flat shipping)
//   SHOP_FREE_SHIP_OVER_CENTS e.g. "10000"   (free shipping over $100; 0/unset = never)

export function shopTaxRate() {
    const raw = Number(process.env.SHOP_TAX_RATE);
    return Number.isFinite(raw) && raw >= 0 && raw < 0.2 ? raw : 0.06875; // MN state base as fallback
}

export function shopTaxCents(subtotalCents) {
    return Math.round((Number(subtotalCents) || 0) * shopTaxRate());
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
