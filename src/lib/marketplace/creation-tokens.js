// ── Creations: the single source of truth for the buyable "Creation" tiers. A Creation is
// spent in the "Make your own" flow to design your own AI art (stored under mkt_buyer as
// custom_deco_credits — presented to members as "Creations"; the `tokens` field below is that count).
// Buying a tier grants CREATIONS + COINS (gold). This is deliberately SEPARATE from store credit: no dollar
// balance is added, only creations + coins.
//
// This module is isomorphic (no DB / server-only imports) so both the buy screen (client) and the checkout
// route (server) share the exact same ladder. Each tier is a better deal than the last: more tokens and more
// coins per dollar as the price goes up. The $5 base tier is fixed by the owner.

// price cents → tokens + coins. Ordered cheapest → richest.
export const CREATION_TOKEN_TIERS = [
    { id: "ct5", priceCents: 500, tokens: 3, coins: 1000 },
    { id: "ct10", priceCents: 1000, tokens: 7, coins: 2200 },
    { id: "ct25", priceCents: 2500, tokens: 20, coins: 6000, popular: true },
    { id: "ct50", priceCents: 5000, tokens: 42, coins: 13000 },
    { id: "ct100", priceCents: 10000, tokens: 90, coins: 28000, bestValue: true },
];

// The base tier anchors the "value" comparisons (bonus %) shown on the richer tiers.
export const BASE_CREATION_TIER = CREATION_TOKEN_TIERS[0];

export function getCreationTier(id) {
    return CREATION_TOKEN_TIERS.find((t) => t.id === String(id)) || null;
}

const dollars = (cents) => Math.max(1, Number(cents) || 0) / 100;

// Per-dollar rates — the raw "how much do I get per $1" figures.
export function coinsPerDollar(tier) {
    return tier ? tier.coins / dollars(tier.priceCents) : 0;
}
export function tokensPerDollar(tier) {
    return tier ? tier.tokens / dollars(tier.priceCents) : 0;
}

// Coin bonus vs. the base tier, as a whole-number percent (base = 0). Drives the "+X% coins" badge.
export function coinBonusPct(tier) {
    const base = coinsPerDollar(BASE_CREATION_TIER);
    if (!tier || base <= 0) return 0;
    return Math.round((coinsPerDollar(tier) / base - 1) * 100);
}

// Token bonus vs. the base tier, whole-number percent — the "extra tokens per $" edge on bigger buys.
export function tokenBonusPct(tier) {
    const base = tokensPerDollar(BASE_CREATION_TIER);
    if (!tier || base <= 0) return 0;
    return Math.round((tokensPerDollar(tier) / base - 1) * 100);
}
