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
// ⚠️ THE FIRST SET WAS WRONG BY A FACTOR OF SIX, AND ONLY THE PRICING SCRIPT CAUGHT IT. They were calibrated
// against a "top player 241,512" read out of mkt_token_event — which is a DIFFERENT token system, not the
// casino's ledger. The real figure, from mkt_chip_event and now seeded into mkt_buyer.casino_won, is
// 1,339,736. At the old intervals the Den's first day would have been 101 Mythic chests and one member
// taking +44 might. Re-run scripts/casino-ladder.mjs after touching anything here; it is the only thing
// standing between a ladder and a landslide.
//
// The live distribution it is calibrated against: 25 members have won anything, the best 1,339,736, the
// second 745,368, the third 153,536, and a long tail down to about 19,000.
//
// THE STAT INTERVALS are set so the best player's entitlement lands near the SEVEN levels he already bought
// — about 190,000 a level. That is the whole calibration. A ladder that handed the top player forty-four
// levels would be a power injection wearing a reward's clothes; one that handed him two would be taking
// something away.
export const STAT_EVERY = {
    might: 150000,
    vitality: 175000,
    tenacity: 200000,
    ferocity: 225000,
};

// The five Counter pets. Luke: "the pets that are all 50k should be like 10 20 30 40 50k etc if you can get
// my drift" — the drift is an EVEN LADDER where there used to be one flat price, and this is that ladder at
// the scale the floor actually plays at. 10/20/30/40/50k against a top player of 1.3M would have handed all
// five to twelve members on the first day and left the rung with nothing to say afterwards.
//
// Each one carries a casinoPerk, so this is also the order in which the floor gets kinder to you.
export const PET_AT = {
    copper_paw: 50000,
    brass_magpie: 100000,
    jade_tortoise: 150000,
    ivory_adder: 200000,
    onyx_hare: 250000,
};

// Sable's three, behind the rope. Higher than the Counter's five because the rope is the point of them.
export const VIP_PET_AT = {
    house_ferret: 350000,
    velvet_lynx: 600000,
    midnight_crane: 900000,
};

// The one-time unlocks. These were 15k/20k/25k/100k/1M in chips and the order was close to arbitrary; it is
// an order now. The charts come first because they open a whole tier of fishing and the newest player should
// have somewhere to get to; the pass is last because the rope has to go on meaning something — nobody in the
// Den reaches it today, and the best player is within sight of it.
export const UNLOCK_AT = {
    fish_deep: 40000,
    wheel_gold: 120000,
    recipe_master: 250000,
    road_long: 600000,
    vip_pass: 1500000,
};

// ── THE CHESTS, EVERY X ──────────────────────────────────────────────────────────────────────────────────
// The only rungs that repeat for ever, which is what makes the ladder infinite — past the last pet and the
// last unlock there has to be a reason to keep playing, and this is it.
//
// ⚠️ SIZED BY WHAT THE WHOLE DEN IS OWED ON DAY ONE, not by what feels right. At 25k a Mythic the first day
// would have been 101 chests; at 150k it is 17, against a game that already mints about 570 a month.
export const CHEST_EVERY = {
    mythic: 150000,
    ascendant: 400000,
    eternal: 1000000,
    celestial: 3000000,
    primordial: 10000000,
};

// Sable's repeatables. VIP-gated as they always were, and the only two rungs on the ladder that are.
export const VIP_EVERY = {
    gem: 200000,
    recipe_page: 450000,
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
