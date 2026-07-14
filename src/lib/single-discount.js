// Online-shop "10% off any single over $100" promo. Single source of truth so the price we DISPLAY and
// the price we CHARGE can never disagree. Client-safe (no server-only import) — used by both the cart
// pricing on the server and the strikethrough display on the client.
//
// Online-only: this never touches the Square catalog price, so in-store POS keeps charging full price.
// A "single" is detected by the trailing condition token in the name (NM/LP/MP/HP/DMG) — sealed and
// accessories have none and are never discounted.

export const SINGLE_DISCOUNT_RATE = 0.1;
export const SINGLE_DISCOUNT_MIN_CENTS = 10000; // strictly OVER $100.00

const CONDITION_RE = /\s(NM|LP|MP|HP|DMG)\s*$/;

export function isSingleName(name) {
    return CONDITION_RE.test(String(name || "").trim());
}

// Given an item's name + full (catalog) price in cents, return the online-shop pricing breakdown.
// Non-eligible items return a zero discount, so callers can use the result unconditionally.
export function computeShopPricing(name, priceCents) {
    const originalCents = Math.max(0, Math.round(Number(priceCents) || 0));
    const eligible = originalCents > SINGLE_DISCOUNT_MIN_CENTS && isSingleName(name);
    if (!eligible) {
        return { originalCents, priceCents: originalCents, discountCents: 0, isDiscounted: false };
    }
    const discounted = Math.round(originalCents * (1 - SINGLE_DISCOUNT_RATE));
    return { originalCents, priceCents: discounted, discountCents: originalCents - discounted, isDiscounted: true };
}

// Dollar-denominated convenience for client display code that works in dollars.
export function computeShopPricingDollars(name, priceDollars) {
    const p = computeShopPricing(name, Math.round((Number(priceDollars) || 0) * 100));
    return { originalDollars: p.originalCents / 100, priceDollars: p.priceCents / 100, isDiscounted: p.isDiscounted };
}
