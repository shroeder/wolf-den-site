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

// The id itself, for the places that need it as a VALUE rather than as a question — a SQL predicate cannot
// call `isPrimaryOwner`. The casino report excludes it: Luke plays the floor to test it, and one owner with a
// test panel outweighs the whole membership (see casino-report.js).
export function primaryOwnerId() {
    return PRIMARY_OWNER_ID;
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

/** Just staff — used by the role and channel system, which treats owner and staff as different things. */
export function isStaff(buyerId) {
    return Boolean(buyerId) && STAFF_BUYER_IDS.has(String(buyerId));
}

/** Owner or staff — the people who cannot win a real-world prize from the shop they work for. */
export function isHouse(buyerId) {
    return isOwner(buyerId) || (Boolean(buyerId) && STAFF_BUYER_IDS.has(String(buyerId)));
}

// ── AND THE SAME TWO LISTS, ENUMERATED ───────────────────────────────────────────────────────────────────────
// `isOwner`/`isStaff` answer "is this person one" and the private-room roster needs "who are they all" — you
// cannot build a list of the staff room's members out of a predicate. Handed back as fresh arrays rather than
// the Sets themselves, because a caller that can `.add()` to one of these is a caller that can grant itself
// the owner gate at runtime.
export function houseBuyerIds() {
    return [...OWNER_BUYER_IDS, ...STAFF_BUYER_IDS];
}

// ── BARRED FROM THE REAL-WORLD PRIZES, AND NOT TOLD ──────────────────────────────────────────────────────────
// A separate list from the house one, and it has to be separate for two reasons.
//
// THE FIRST IS THAT IT IS SILENT. `isHouse` is sent to the boss screen as `raffleHouse` and draws a banner
// saying the house does not enter — which is right for staff, who know and would say so themselves. This list
// draws nothing. The screen looks exactly as it did; the name is simply never in the hat. Somebody who has
// been quietly barred and can see they have been barred just makes another account.
//
// THE SECOND IS THAT IT MEANS SOMETHING DIFFERENT. Staff are excluded because it would look bad for the shop
// to hand its own prize to its own people, and they lose nothing they earned. This list is a consequence:
// members who obtained their standing in a way that took the prize off somebody who played straight.
//
// Everything in-game still pays. XP, chests, spin tokens, pet rolls — all untouched, exactly as for staff.
// This gate is only ever asked about the thing that costs the shop money off its own shelf.
//
// 2026-08-22 — hudson (trev.mielke@gmail.com). Ran a second account, tkmielke17, created the day before the
// first transfer and sharing a surname; it earned 114,945 gold and handed 98,225 of it — 85% of everything it
// ever made — to this account across fourteen one-way trades and auction buys in eleven days. That was 31% of
// all the gold this account has ever received, it went into consumables, and consumables are boss damage: he
// leads the current boss by 47% on FEWER swings than second place. The prizes are physical and come off a
// shelf in Montgomery. See scripts/check-alts.mjs, which now finds this shape in a single query.
const PRIZE_BARRED_BUYER_IDS = new Set([
    "4fed7f13-8931-45b8-a014-71367b9fcba6", // hudson
]);

/**
 * Barred from the real-world draw, silently. Checked wherever `isHouse` is checked for the RAFFLE POOL, and
 * nowhere that reaches the client — see the note above on why the difference matters.
 */
export function barredFromPrizes(buyerId) {
    return Boolean(buyerId) && PRIZE_BARRED_BUYER_IDS.has(String(buyerId));
}
