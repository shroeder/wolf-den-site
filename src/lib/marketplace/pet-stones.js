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
// A single stone would make this a formality: reach 6, press the button, done. Two make it a decision you have
// to actually think about, and — because the choice is per pet and the stones are scarce — one you will make
// differently on different pets.
//
// Neither stone takes anything away. Both enshrine the ability exactly as it worked. They differ in what they
// add on top, and they are deliberately not comparable by arithmetic:
//
//   LIGHTSTONE — BREADTH. The ability is permanent at full strength, and your whole PACK gets brighter: every
//   pet you own contributes more of its passive. Best on a pet whose active you want kept, when what you
//   really have is a big menagerie doing quiet work in the background.
//
//   DARKSTONE — DEPTH. The ability is permanent at HALF AGAIN its strength — stronger than it has ever been,
//   including while you were carrying the pet around. It gives nothing to anybody else. Best when one specific
//   ability is the thing you actually care about and you want it to hit as hard as it possibly can.
//
// Neither is the "good" one. Light is worth more the more pets you own; Dark is worth more the better the
// single ability is. A member with sixty pets and a member with one great one should reach for different rocks.
export const STONES = {
    light: {
        id: "light",
        name: "Lightstone",
        art: "/images/pets/stone-light.png",
        color: "#ffe08a",
        kick: "Breadth",
        blurb: "The ability is kept exactly as it is, forever — and the whole pack shines with it.",
        // What it does to the ability it enshrines: nothing. It is preserved at the value it already had.
        activeMult: 1,
        // ...and every owned pet's PASSIVE gets this much better. Stacks with the menagerie aura the top
        // rarities already grant, and is capped alongside it so a wall of Lightstones cannot run away.
        packAura: 0.12,
        line: "Keeps the ability at full strength, and every pet you own gives +12% more of its passive.",
    },
    dark: {
        id: "dark",
        name: "Darkstone",
        art: "/images/pets/stone-dark.png",
        color: "#b061ff",
        kick: "Depth",
        blurb: "The ability is kept and sharpened — stronger enshrined than it ever was in your hands.",
        activeMult: 1.5,
        packAura: 0,
        line: "Keeps the ability and raises it to 150% — the strongest a pet ability gets.",
    },
};

export const STONE_IDS = Object.keys(STONES);
export const stoneById = (id) => STONES[String(id || "")] || null;

// The aura a set of enshrinements contributes. Lightstones ADD UP — a second one is worth having — but with
// sharply diminishing returns, so the tenth is nearly nothing and the number cannot be farmed into absurdity.
// √n rather than n: two Lightstones are worth 1.41 of one, four are worth 2, sixteen are worth 4.
export const PACK_AURA_CAP = 0.5;
export function packAuraFrom(enshrined = []) {
    const lights = enshrined.filter((e) => e?.stone === "light").length;
    if (!lights) return 0;
    return Math.min(PACK_AURA_CAP, STONES.light.packAura * Math.sqrt(lights));
}

/** The multiplier an enshrined pet's active perk is worth, by the stone that enshrined it. */
export const enshrinedMult = (stone) => stoneById(stone)?.activeMult || 1;

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
