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
// ── NEVER ON SOMEBODY ELSE'S CARD ────────────────────────────────────────────────────────────────────────────
// Luke, seeing 10% OFF on a consigned shelf: "we cant offer discount on consigner categories."
//
// He is right, and it is worse than a policy breach — it sells at a loss. The consignor is owed their share of
// the price the card was listed at, and eight of the nine active consignors are on 87% to 95%. Ten percent off
// is therefore larger than the shop's whole margin: a $153 single discounted to $137.70 against a 95% payout
// takes $137.70 in and owes $145.35 out.
//
// This rule only ever saw a NAME and a PRICE, so it had no way to know. `consigned` comes off the feed row,
// stamped by the reconciler, which is the one place that has Square's category ID — the key consignors are
// filed under. See migration 412.
export function computeShopPricing(name, priceCents, { consigned = false } = {}) {
    const originalCents = Math.max(0, Math.round(Number(priceCents) || 0));
    const eligible = !consigned && originalCents > SINGLE_DISCOUNT_MIN_CENTS && isSingleName(name);
    if (!eligible) {
        return { originalCents, priceCents: originalCents, discountCents: 0, isDiscounted: false };
    }
    const discounted = Math.round(originalCents * (1 - SINGLE_DISCOUNT_RATE));
    return { originalCents, priceCents: discounted, discountCents: originalCents - discounted, isDiscounted: true };
}

// Dollar-denominated convenience for client display code that works in dollars.
export function computeShopPricingDollars(name, priceDollars, opts = {}) {
    const p = computeShopPricing(name, Math.round((Number(priceDollars) || 0) * 100), opts);
    return { originalDollars: p.originalCents / 100, priceDollars: p.priceCents / 100, isDiscounted: p.isDiscounted };
}
