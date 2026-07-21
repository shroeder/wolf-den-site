// Owner-only gate for in-development features. Rather than a feature flag, unreleased systems (e.g. the
// Sailing minigame) check the authenticated buyer against this allow-list so ONLY the shop owner account can
// see them on the live site. Add teammates' buyer ids here to let them preview too.
const OWNER_BUYER_IDS = new Set([
    "6857d67e-3dd0-46b6-aad7-b91699155ff6", // The Wolf Den (Luke)
]);

export function isOwner(buyerId) {
    return Boolean(buyerId) && OWNER_BUYER_IDS.has(String(buyerId));
}
