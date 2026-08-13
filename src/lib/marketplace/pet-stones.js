// ── THE LIGHTSTONE AND THE DARKSTONE ─────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the pets page, the shops and the bonus maths all read the same table.
//
// ── THE PROBLEM THESE SOLVE ──────────────────────────────────────────────────────────────────────────────────
// People were swapping pets all day. Not because swapping is fun, but because every pet's ACTIVE ability only
// works while that pet is out, so the optimal play was: equip the farm pet to harvest, the fishing pet to cast,
// the boss pet to strike, the forge pet to salvage, and back again. That is not a decision, it is an errand you
// run four times a day, and the people doing it were not enjoying it — they were doing it because not doing it
// was strictly worse.
//
// ENSHRINING is the answer. Take one pet all the way to level 6 — a commitment measured in weeks, and only the
// EQUIPPED pet earns XP, so the cost is that you cannot be swapping while you do it — then spend a stone. That
// pet's active ability becomes PERMANENT: it works whether the pet is equipped or not, forever. You are free.
//
// ── WHY TWO STONES ───────────────────────────────────────────────────────────────────────────────────────────
// A single stone would make this a formality: reach 6, press the button, done. Two make it a decision — but
// only if the two are actually different ON THIS PET, and the first cut of these was not.
//
// ── WHAT THE FIRST CUT GOT WRONG ─────────────────────────────────────────────────────────────────────────────
// Light was "+12% to a pack-wide aura" and Dark was "x1.5 on the ability", for every one of the ninety-eight
// pets in the game. Thirty-eight distinct abilities and one question, worded identically every time, so the pet
// being enshrined never entered into it. Two options is not the same thing as a decision.
//
// The numbers were wrong as well. Against the biggest real collection in the Den — thirteen pets — a Lightstone
// moved Might by half a point, because the aura multiplied a pack passive total small enough to round away. It
// only became meaningful past twenty-five pets, which nobody owns and the drop rate cannot deliver. And on five
// ability keys the Darkstone did nothing at all: x1.5 landed above an existing cap and was discarded in silence.
//
// So the pack aura is DELETED and what a stone does now lives per pet, authored, in pet-ascension-effects.js.
// There is no fixed axis — Light is not always "wider" and Dark is not always "harder". On some pets the
// interesting stone is the one that doubles what it already does; on others it is the one that teaches it a
// second trade. Read the pet.
//
// What both stones still share, and always will: enshrining keeps the ability PERMANENTLY, whether that pet is
// equipped or not. That is the promise, and it is the same promise on both.
export const STONES = {
    light: {
        id: "light",
        name: "Lightstone",
        art: "/images/pets/stone-light.png",
        color: "#ffe08a",
        blurb: "Keeps the ability forever, and changes the pet — differently on every pet there is.",
    },
    dark: {
        id: "dark",
        name: "Darkstone",
        art: "/images/pets/stone-dark.png",
        color: "#b061ff",
        blurb: "Keeps the ability forever, and changes the pet — differently on every pet there is.",
    },
};

export const STONE_IDS = Object.keys(STONES);
export const stoneById = (id) => STONES[String(id || "")] || null;

// ── WHERE STONES COME FROM ───────────────────────────────────────────────────────────────────────────────────
// Luke's brief, and the two failure modes he named: "I want it to end up in a place where people want them but
// don't have them", and "I definitely do not want it to end up in a place where people have a bunch of them and
// they can't use them."
//
// Those pull in opposite directions and the second one is the harder constraint, because a stone is only usable
// against a level-6 pet — and a level-6 pet is 42 days of work at the very cheapest. So the drop rate is not
// really set against "how often does it feel good to find one", it is set against HOW FAST PETS REACH SIX. If
// stones arrive faster than that, they pile up and mean nothing.
//
// A dedicated member reaches level 6 on maybe one pet every two to three months. So a stone every few weeks is
// roughly right: rare enough to be a real find, common enough that the pet you have been growing has a stone
// waiting when it gets there.
//
// THE FIRST CUT OF THESE WAS FOUR TIMES TOO GENEROUS and it did not look it — 0.6% off a mine run reads as
// nothing until you multiply it by how often a dedicated member actually runs the mine. It came out at two
// stones a month against one pet finishing every seventy days, which is five stones sitting in a bag per pet
// that could use one: the exact pile-up this was meant to avoid. scripts/check-stones.mjs measures the ratio
// rather than the rate, and that is the only reason it was caught.
//
// Four sources, deliberately spread across four different things to do, so no single grind is the stone farm:
export const STONE_SOURCES = {
    // The Depths: the deepest seams. Scales with depth so it rewards going down rather than going often.
    mine_seam: { label: "a deep seam", chance: 0.0015 },
    // Sailing: what the dredge turns up on a dig.
    sail_dig: { label: "a dig", chance: 0.00125 },
    // The boss: only on a KILL, which is a whole-server event a few times a week.
    boss_kill: { label: "a boss kill", chance: 0.02 },
    // The Depths' dungeons: the floor-ten boss, one run per dungeon per day.
    delve_boss: { label: "a dungeon boss", chance: 0.003 },
    // ── AND THE WHEEL'S BONUS ROUND ──────────────────────────────────────────────────────────────────────────
    // A WEDGE, not a roll — it is painted on the mini wheel's disc and you land on it. The chance here is that
    // wedge's real odds so this table stays the one place the supply is measured: reaching the bonus round is
    // about 4.5% of a spin (weight 6 of 134 on the main wheel) and the stone is weight 1 of 88 on the round
    // itself, which is 0.045 * 0.011 ≈ 0.0005.
    //
    // It is deliberately the SMALLEST source in the table despite sitting on the most-used screen in the game,
    // because the wheel is spun 2.4 times a day by the average member and sixteen by the heaviest — frequency
    // is exactly what makes a wheel wedge dangerous for a chase item. See check-stones.mjs for the ratio.
    spin_bonus: { label: "the wheel's bonus round", chance: 0.0005 },
};

// ── AND THE SHOPS ────────────────────────────────────────────────────────────────────────────────────────────
// "One thing we can always do is add them to the doubloon shop and the laurel shop if for whatever reason
// people just can't get lucky enough." A chase item you cannot chase is a wall, and randomness eventually
// hands somebody nothing for a month. So both stones sit in both shops at a deliberately unfriendly price —
// affordable, but only if you decide it is the thing you are saving for.
//
// ── PRICED AGAINST WHAT THE CURRENCIES ACTUALLY EARN, NOT AGAINST A FEELING ─────────────────────────────────
// The first pass put a stone at 900 doubloons "because that is roughly a month". It is not: a fleet win pays
// `6 + rank*2` and you get five raids a day, so a maxed captain earns 180 a day and clears 900 in FIVE. It was
// also cheaper than a single collection piece (1,000) while being worth considerably more — and the whole
// point of these is to be the floor under bad luck, not a shortcut past the luck entirely.
//
// Both are now about THREE WEEKS of dedicated earning in their own currency, which is the same order as the
// pet's own climb to level six and keeps the two routes level — otherwise whichever is cheaper becomes the
// only one anybody uses:
//
//   doubloons  180/day at rank 15 with 5 raids  ->  4,000 is ~22 days
//   laurels    ~350/day at 10 bouts a day        ->  7,500 is ~21 days
//
// scripts/check-stones.mjs prints those days from the real earn formulas, so the claim is checked rather than
// asserted in a comment that slowly stops being true.
export const STONE_PRICE_DOUBLOONS = 4000;
export const STONE_PRICE_LAURELS = 7500;
