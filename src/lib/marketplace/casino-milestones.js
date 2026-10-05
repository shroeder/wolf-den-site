// ── THE CASINO IS A LADDER NOW, NOT A SHOP ───────────────────────────────────────────────────────────────
// Luke: "Unlocking things in the casino and vip is going to be based on total amount of gold won lifetime at
// the casino right now a lot of things are thr same price instead they are just claimable noe if youve
// reached milestones. So lets make the milestone amount differ. And the chests will be every x, as well as
// the stat unlocks, and the pets that are all 50k should be like 10 20 30 40 50k etc."
//
// So: nothing on this floor is bought. Everything is CLAIMED, and the only currency is a number that goes up
// on its own while you play — the gold you have won here, for ever, which nothing can spend down.
//
// ⚠️ PURE, AND DELIBERATELY SO. No `server-only`, no db import: the table is read by the screen, by the claim
// path, and by two scripts that price it. A ladder whose rungs live in a server module is a ladder the client
// has to keep a second copy of, and the copy is the one the player reads.
//
// ── WHY THE OLD SHELF HAD TO GO ──────────────────────────────────────────────────────────────────────────
// Measured before this was written: the five Counter pets were 50,000 chips each, Sable's three were 50,000
// each, and the four stat tracks shared one escalating curve. Eight of the fifteen things on the floor cost
// exactly the same, which says they are the same size of achievement — and they are not. A flat price is a
// shop's answer ("pick the one you want"); a ladder has to answer "what is next", and it cannot do that if
// four rungs are at the same height.
//
// ── AND NOBODY LOSES WHAT THEY BOUGHT ────────────────────────────────────────────────────────────────────
// Eleven members hold stat levels bought with chips, the best of them seven. `entitled` is a FLOOR, never a
// ceiling: the claim path grants up to the entitlement and leaves anything above it alone. A member who
// bought more than the ladder would give them keeps all of it.

// ── THE INTERVALS, AND WHY THEY ARE THESE NUMBERS ────────────────────────────────────────────────────────
// Calibrated against the real distribution rather than picked: 28 members have won anything here, the best
// 241,512 lifetime, the median 21,652, the 25th percentile 3,064.
//
// The STAT intervals are set so the best player's entitlement lands near the seven levels they already
// bought — about 30-40k a level. That is the whole calibration: a ladder that handed the top player thirty
// levels on the first day would be a power injection wearing a reward's clothes, and one that handed them
// three would be taking something away.
export const STAT_EVERY = {
    might: 30000,
    vitality: 34000,
    tenacity: 38000,
    ferocity: 42000,
};

// The five Counter pets, exactly as asked. Each carries a casinoPerk, so this ladder is also the order in
// which the floor gets kinder to you.
export const PET_AT = {
    copper_paw: 10000,
    brass_magpie: 20000,
    jade_tortoise: 30000,
    ivory_adder: 40000,
    onyx_hare: 50000,
};

// Sable's three, behind the rope. Higher than the Counter's five because the rope is the point of them, and
// spread rather than flat for the same reason everything else here is.
export const VIP_PET_AT = {
    house_ferret: 75000,
    velvet_lynx: 110000,
    midnight_crane: 150000,
};

// The one-time unlocks. These were 15k/20k/25k/100k/1M in chips and the order was close to arbitrary; it is
// an order now. The charts come early because they open a whole tier of fishing and the earliest player
// should have somewhere to get to; the pass is last because the rope has to go on meaning something.
export const UNLOCK_AT = {
    fish_deep: 8000,
    wheel_gold: 35000,
    recipe_master: 65000,
    road_long: 140000,
    vip_pass: 350000,
};

// ── THE CHESTS, EVERY X ──────────────────────────────────────────────────────────────────────────────────
// The only rungs that repeat for ever, which is what makes the ladder infinite — past the last pet and the
// last unlock there has to be a reason to keep playing, and this is it.
//
// ⚠️ SIZED BY WHAT THE WHOLE DEN WOULD BE OWED ON DAY ONE, not by what feels right. scripts/casino-ladder.mjs
// computes that from the live lifetime figures before any of this ships; the first draft of these intervals
// would have handed one member sixteen Mythic chests in a single claim.
export const CHEST_EVERY = {
    mythic: 25000,
    ascendant: 70000,
    eternal: 200000,
    celestial: 500000,
    primordial: 2000000,
};

// Sable's repeatables. VIP-gated as they always were, and the only two rungs on the ladder that are.
export const VIP_EVERY = {
    gem: 40000,
    recipe_page: 90000,
};

/** How many of an `every X` rung a lifetime total has earned. */
export const earnedEvery = (won, every) => (every > 0 ? Math.floor(Math.max(0, won) / every) : 0);

/**
 * Everything this lifetime total entitles a member to, as a flat list the screen and the claim path both read.
 *
 * ⚠️ IT IS A PURE FUNCTION OF ONE NUMBER. That is the entire security model of the claim: the server recomputes
 * this from the stored lifetime figure and grants the difference against what has already been claimed, so
 * there is nothing in a request body that can move it and no way for a stale tab to claim a rung twice.
 */
export function entitlements(won = 0) {
    const out = [];
    for (const [stat, every] of Object.entries(STAT_EVERY)) {
        out.push({ kind: "stat", ref: stat, every, n: earnedEvery(won, every), next: (earnedEvery(won, every) + 1) * every });
    }
    for (const [ref, at] of Object.entries(PET_AT)) out.push({ kind: "pet", ref, at, n: won >= at ? 1 : 0, next: at });
    for (const [ref, at] of Object.entries(VIP_PET_AT)) out.push({ kind: "vip_pet", ref, at, n: won >= at ? 1 : 0, next: at, vip: true });
    for (const [ref, at] of Object.entries(UNLOCK_AT)) out.push({ kind: "unlock", ref, at, n: won >= at ? 1 : 0, next: at });
    for (const [ref, every] of Object.entries(CHEST_EVERY)) {
        out.push({ kind: "chest", ref, every, n: earnedEvery(won, every), next: (earnedEvery(won, every) + 1) * every });
    }
    for (const [ref, every] of Object.entries(VIP_EVERY)) {
        out.push({ kind: ref === "gem" ? "gem" : "recipe", ref, every, n: earnedEvery(won, every), next: (earnedEvery(won, every) + 1) * every, vip: true });
    }
    return out;
}

/** The next rung above a lifetime total, whatever kind it is — what the screen puts at the top. */
export function nextRung(won = 0) {
    const all = entitlements(won).map((e) => e.next).filter((n) => n > won);
    return all.length ? Math.min(...all) : null;
}
