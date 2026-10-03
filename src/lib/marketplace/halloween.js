// ── THE HALLOWEEN EVENT ──────────────────────────────────────────────────────────────────────────────────
// Pure — no db, no server-only — so the chest tables, the grant path, the catalogues and any generator
// script all read the same switch. Same shape as SEASON_PUBLIC in arena-season.js, and for the same reason:
// the event touches the sea, the dig, the chest ladder, the item catalogue and the pet pool, and those are
// separate files that have never heard of each other. Gate them with five booleans and the first mistake
// anybody makes is flipping four of them.
//
// ⚠️ ONE LINE TURNS THE EVENT ON. While it is false the four chests cannot be granted, cannot be opened and
// do not appear in any list — but the art, the items and the pets all exist, which is what makes the whole
// thing testable on the live site before anybody else can see it.
export const HALLOWEEN_PUBLIC = false;

/** `unreleased` for a Halloween-exclusive catalogue row. Kept here so the catalogues cannot drift apart. */
export const HALLOWEEN_HIDDEN = !HALLOWEEN_PUBLIC;

// The four chests, cheapest first. This IS the ladder — see the note in chest-art-prompts.js about why four
// chests of equal value would be four names for one object.
export const HALLOWEEN_CHESTS = ["hw_candycorn", "hw_pumpkin", "hw_skeleton", "hw_ghost"];
export const isHalloweenChest = (tier) => HALLOWEEN_CHESTS.includes(tier);

// ── THE FAUCET ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we will distribute chests like we do other chests. Randomly. Not common but not rare, so uncommon
// chance for a chest under mythic to be a Halloween chest."
//
// So this is a SUBSTITUTION at grant time, not a new source. Every chest the game already hands out — the
// wheel, the boss, quests, the mine, digging, the merchant, level-ups — rolls this on its way in, and a
// chest that wins becomes its Halloween counterpart instead of arriving alongside one. Nothing anywhere
// needs to know the event exists; addChests is the single door they all go through.
//
// ⚠️ SUB-MYTHIC ONLY, WHICH IS WHAT MAKES IT SAFE. A mythic-and-up chest is somebody's rare find and must
// never be quietly turned into a seasonal one — that would be taking a reward away and calling it a bonus.
// The three ordinary tiers are the ones members open by the dozen, so a substitution there costs nobody
// anything they were counting on.
const SUBSTITUTE = { wooden: "hw_candycorn", iron: "hw_pumpkin", gold: "hw_skeleton" };

// 12% — "not common but not rare". Roughly one Halloween chest per eight ordinary ones, so an active member
// meets a few a week across the event and it never stops feeling like a find.
export const HALLOWEEN_SUBSTITUTION = 0.12;

// The ghost chest is not on the substitution map on purpose: it is the top of the ladder and would be as
// common as the other three if it simply took gold's place. It rides on top, as a slice of the roll that
// already succeeded, so it stays the one people are actually chasing.
const GHOST_SHARE = 0.10;

/**
 * What this grant of `tier` should actually become. Returns the same tier when nothing was substituted, so
 * callers can use it unconditionally.
 */
export function halloweenSwap(tier, roll = Math.random(), ghostRoll = Math.random()) {
    if (!HALLOWEEN_PUBLIC) return tier;
    const swap = SUBSTITUTE[tier];
    if (!swap) return tier;                       // mythic and up are never touched
    if (roll >= HALLOWEEN_SUBSTITUTION) return tier;
    return ghostRoll < GHOST_SHARE ? "hw_ghost" : swap;
}

// ── THE UNQUIET IS THE WHEEL'S SET, AND ONLY THE WHEEL'S ─────────────────────────────────────────────────
// Luke: "a set for halloween you can only get from the wheel during halloween."
//
// Three Halloween sets were authored together and all three dropped from Halloween CHESTS. That was already
// odd for this one: The Unquiet's bonuses are wheel luck and a free-respin capstone, and sets.js files it
// under `feature: "wheel"`, so the one set whose every line is about the wheel was the one you could not win
// at it. It comes off the chest table and onto THE OFFERING (see spin.js) — its only source while the event
// is up, and no source at all once the event is down.
//
// ⚠️ THE OTHER TWO STAY ON CHESTS. Hollowed Harvest (farm) and Gravebound (depth) have nothing to do with the
// wheel, and moving them there would make one wedge the source of fifteen pieces in a month — which is not a
// chase, it is a queue. Only the wheel's own set moves.
export const HALLOWEEN_WHEEL_SET = "hw_unquiet";
