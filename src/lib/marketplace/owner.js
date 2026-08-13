// Owner-only gate for in-development features. Rather than a feature flag, unreleased systems (e.g. the
// Sailing minigame) check the authenticated buyer against this allow-list so ONLY the shop owner account can
// see them on the live site. Add teammates' buyer ids here to let them preview too.
const OWNER_BUYER_IDS = new Set([
    "6857d67e-3dd0-46b6-aad7-b91699155ff6", // The Wolf Den (Luke)
]);

// The PRIMARY owner — the ONLY account allowed to trigger/end live Town raids (a surprise drop pushed to the
// whole membership). Co-owner accounts (e.g. Luke's wife) may be owners for other previews but must never be
// able to fire a raid at everyone, so the raid controls check THIS, not the broader owner allow-list.
const PRIMARY_OWNER_ID = "6857d67e-3dd0-46b6-aad7-b91699155ff6"; // The Wolf Den (Luke)

export function isOwner(buyerId) {
    return Boolean(buyerId) && OWNER_BUYER_IDS.has(String(buyerId));
}

export function isPrimaryOwner(buyerId) {
    return Boolean(buyerId) && String(buyerId) === PRIMARY_OWNER_ID;
}

// ── THE HOUSE DOES NOT WIN THE RAFFLE ────────────────────────────────────────────────────────────────────────
// The boss raffle hands out a REAL object off the shelf in Montgomery, and it is a prize the shop is giving to
// its members. The owner was already excluded; staff were not, and staff play — Eric is a regular and finished
// the boss ahead of most of the Den last week. A member watching a shop employee take the physical prize does
// not read as luck no matter how honest the draw was, and the draw IS honest, which is exactly why it has to
// look it.
//
// They lose nothing else. Everything else the kill pays — XP, the spin token, the pet rolls, the chests — is
// in-game and stays. This gate is only ever asked about the thing that costs the shop money.
//
// A HAND-KEPT LIST, deliberately. There is no staff flag anywhere: admin_app_users is the admin app's login
// table and holds exactly one account, so it cannot answer this. Rather than invent a schema for a handful of
// people who change once a year, the list lives here beside the owner list it works with. ADD NEW STAFF HERE
// when somebody joins — nothing else in the codebase will do it for you.
const STAFF_BUYER_IDS = new Set([
    "d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e", // Eric D
]);

/** Owner or staff — the people who cannot win a real-world prize from the shop they work for. */
export function isHouse(buyerId) {
    return isOwner(buyerId) || (Boolean(buyerId) && STAFF_BUYER_IDS.has(String(buyerId)));
}
