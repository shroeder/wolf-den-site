import { ARCHETYPES } from "@/lib/marketplace/arena-npc.js";

// ── THE LONG ROAD ────────────────────────────────────────────────────────────────────────────────────────────
// A hundred named opponents, each beatable exactly ONCE, in whatever order you like.
//
// WHY IT IS NOT THE GAUNTLET. The Gauntlet is matchmaking: it hands you somebody near your own strength, it
// repeats forever, and its opponents are a tier with a numeral after it — "Veteran IV" is a difficulty, not a
// person. This is the opposite of all three. Every name here is one specific fighter, you may walk up to any
// of them at any time, and once they are down they are down for good. That is what makes it a LADDER rather
// than a treadmill: the reward for beating one is that it is gone.
//
// WHAT MAKES IT WORTH DOING. Each one pays once — laurels the whole way, and something real on every tenth.
// There is no daily cap on picking a fight here beyond the one the Arena already has, so a member who wants to
// spend a week climbing may.
//
// THE CURVE. Power runs from roughly a fresh member's kit to well past the best gear in the game, on a smooth
// exponential — so the first ten are a warm-up you clear in an evening and the last ten are a wall you come
// back to. It is deliberately not gated: you are free to walk into number 97 on day one and be removed from
// the premises, because finding that out is part of it.
//
// EVERY ENTRY IS DERIVED, NOT AUTHORED, and that is on purpose: a hundred hand-written stat blocks drift the
// moment the damage formula moves. The NAMES are authored (they are the half that has to have character) and
// everything numeric comes off the rung.

// ── THE FIGHTERS ─────────────────────────────────────────────────────────────────────────────────────────────
// Ten houses of ten. Each house is a place in the world with its own flavour of violence, and the tenth of
// each is its champion — the one that pays a real prize. Names first, because the names are the product.
const HOUSES = [
    {
        key: "yard", name: "The Yard", blurb: "Behind the tavern, for coin and pride.",
        tint: "#9aa0a6",
        who: ["Bartra the Bootblack", "One-Ear Nils", "Dockhand Perrin", "Sela of the Gutters", "Old Mattock",
            "Crooked Jem", "The Rope-Walker", "Fen the Fishmonger", "Halla Bare-Knuckle", "MARROW, Yard King"],
    },
    {
        key: "watch", name: "The Watch", blurb: "Paid to stop you, and good at it.",
        tint: "#6bb8ff",
        who: ["Recruit Odden", "Lampman Coll", "Serjeant Ute", "The Gate Warden", "Halberdier Bryn",
            "Nightwatch Ilsa", "The Toll-Taker", "Captain Vane", "The Iron Whistle", "COMMANDER ROOK"],
    },
    {
        key: "pit", name: "The Pit", blurb: "They do this for a living, and they enjoy it.",
        tint: "#ff9f43",
        who: ["Sandborn Tace", "The Cleaver Twins", "Grissa Two-Blades", "The Laughing Man", "Broken-Nose Var",
            "Ashen Mirel", "The Crowd's Favourite", "Undefeated Oro", "The House Champion", "TITAN OF THE SAND"],
    },
    {
        key: "wood", name: "The Wood", blurb: "Nobody sees them until it is decided.",
        tint: "#5ddc9a",
        who: ["Snare-Setter Wyn", "The Quiet Hunt", "Barkskin Ruth", "The Green Arrow", "Moss-Under-Nail",
            "The Long Watcher", "Thistle", "The Antlered", "She Who Waits", "THE WARDEN OF ROOTS"],
    },
    {
        key: "deep", name: "The Deep", blurb: "Whatever the mine did not want.",
        tint: "#c98bff",
        who: ["Tunnel-Rat Obb", "The Pale Digger", "Candlewright", "The Thing in Seam Nine", "Rockjaw",
            "The Collapse", "Deepwarden Sull", "The Blind Foreman", "What the Dark Kept", "THE LODE ITSELF"],
    },
    {
        key: "tide", name: "The Tide", blurb: "Come up the beach and did not leave.",
        tint: "#4ad6d6",
        who: ["Salt-Crusted Mara", "The Drowned Boy", "Netmender Quill", "Barnacle Ost", "The Undertow",
            "Kelpwalker", "The Ship's Cook", "Captain Grine", "The Wave That Waits", "LEVIATHAN'S PILOT"],
    },
    {
        key: "hall", name: "The Hall", blurb: "Old money, older grudges, sharpest steel.",
        tint: "#ffb648",
        who: ["Squire Aldous", "The Duellist", "Lady Corvane", "The Master of Arms", "Blackglove",
            "The Heir", "The Champion's Second", "Sir Reyven", "The Kingmaker", "THE HIGH SEAT"],
    },
    {
        key: "ash", name: "The Ash", blurb: "What the forge made and could not unmake.",
        tint: "#ff6b4a",
        who: ["Cinder-Boy", "The Bellowsman", "Slagheart", "The Quenching", "Emberwright",
            "The Unfinished Blade", "Forgewidow", "The Anvil's Answer", "What Was Struck Nine Times", "THE FIRST FORGE"],
    },
    {
        key: "veil", name: "The Veil", blurb: "It is not clear these are people.",
        tint: "#b061ff",
        who: ["The Half-Remembered", "Someone's Reflection", "The Borrowed Face", "Nobody At All", "The Long Hour",
            "What Follows You Home", "The Unasked Question", "The Third Wolf", "Your Own Shadow", "THE VEIL ENTIRE"],
    },
    {
        key: "crown", name: "The Crown", blurb: "The last ten. They are not sport.",
        tint: "#ffce6b",
        who: ["The First Champion", "The Undefeated", "The One Who Waited", "The Den's Own", "The Old Wolf",
            "The Long Winter", "The Last Word", "The Pack Entire", "THE ALPHA", "THE WOLF DEN ITSELF"],
    },
];

// ── THE CURVE ────────────────────────────────────────────────────────────────────────────────────────────────
// Written as a FLOOR and a per-rung GROWTH rather than a floor and a ceiling, because those are the two things
// the design actually cares about — how easy the first fight is, and how fast it gets hard — and the ceiling
// is just whatever falls out at rung 100. Expressed the other way round, tuning either one silently moved the
// other.
//
// FLOOR 140 -> 25. Rung 1 was pitched at roughly Gauntlet tier 12: measured against a member with starter
// gear it was not an opening fight, it was a wall with a "1" on it. It is an opening fight now.
//
// ── THE CURVE IS A CLIMB, NOT A LAUNCH ───────────────────────────────────────────────────────────────────────
// It was an exponential, twice, and an exponential is the wrong shape for this no matter what rate you give it.
// At 16.5% a rung it passed a maxed player at rung 21 and reached 216 MILLION power by rung 100. At 3.3% the
// summit came back into reach — and a real loadout then walked to rung 89 without being troubled, because a
// curve gentle enough not to run away is also gentle enough to be a formality.
//
// Luke, setting the actual design: "let's ensure it's a smooth curve. Ideally difficulty is more about their
// skills etc and strategy vs sheer power level. Target rung is still around 35 where we want people to have a
// difficult time, but we don't want it to spike ever. Each fight needs to be interesting. The whole idea
// behind reworking stats recently and how they tie into the arena was to make it so players have more agency
// about how they get stronger and climb the rungs."
//
// That rules out every exponential. What it asks for is a curve that RISES to the limit of what a strong
// player can handle and then stops climbing — so the answer to a late rung is what you built and how you
// fight it, not another order of magnitude. This is a logistic, normalised so rung 1 is exactly the FLOOR and
// rung 100 is exactly the ceiling:
//
//     rung   1      10     20     35     50     75     100
//     power  30     152    354    740    1066   1319   1345
//
// MID 30 and STEEP 14 put the steep part of the S right where the design wants the difficulty — the run into
// the mid-thirties — and flatten it after. Rung 35 lands at 740, which is where a best-in-slot member measures
// as an even fight (verified against a real loadout through kitFor, not a model). Rungs 40-100 rise by about
// half again over sixty rungs: that stretch is meant to be won with a better BUILD and a better read of the
// archetype in front of you, which is the whole point of the stat rework.
const FLOOR = 30;
const CEILING = 1345;
const MID = 30;      // the rung the curve is steepest at
const STEEP = 14;    // how sharply it turns — bigger is gentler
const logistic = (r) => 1 / (1 + Math.exp(-(r - MID) / STEEP));
export const LADDER_SIZE = 100;
const L1 = logistic(1);
const LN = logistic(LADDER_SIZE);

// ── THE HOUSE STEP IS GONE ───────────────────────────────────────────────────────────────────────────────────
// Each house used to cost an extra 5% on top of the curve, to make arriving at The Deep feel like arriving
// somewhere. It is a spike, and the brief is that there are no spikes: a gate that is 5% harder than the rung
// before it lands on a member as the ladder lurching, not as a landmark. The houses still have names, plates,
// blurbs and their own fighters — that is what makes them places. Difficulty is not what a doorway is for.

// ── WHAT THEY TURN ASIDE ─────────────────────────────────────────────────────────────────────────────────────
// Gauntlet tiers carry no damage reduction at all; their bulk is health, which a health bar tells the truth
// about. That is right for matchmaking, where the point is a fair mirror, and wrong for a hundred named
// fighters who are supposed to get genuinely harder to hurt. A Road fighter turns aside a share of every blow,
// rising with the house — printed on their card like anyone's, so it is a number you can plan against rather
// than a mystery in the damage.
export const ladderDr = (rung) => {
    const house = Math.floor((Math.max(1, Math.min(LADDER_SIZE, Math.round(rung))) - 1) / 10);
    return Math.round((0.04 + house * 0.028) * 1000) / 1000;   // 4% in the Yard, 29% at the end
};

// Normalised so rung 1 is exactly FLOOR and rung LADDER_SIZE is exactly CEILING — without it the logistic
// starts partway up its own curve and the first fight is not the floor the design asked for.
const powerAt = (rung) => Math.round(
    FLOOR + (CEILING - FLOOR) * ((logistic(rung) - L1) / (LN - L1)),
);

// A champion (every tenth) is the house's name-bearer.
const isChampion = (rung) => rung % 10 === 0;

/**
 * What beating one pays.
 *
 * Laurels the whole way, because the Arena's own currency is the honest reward for an Arena fight and it now
 * has real sinks (crates, stones, a recipe). Every tenth also pays a chest, and the last one pays the best
 * chest in the game — once, ever, to whoever gets there.
 */
export function ladderReward(rung) {
    const laurels = Math.round(60 * Math.pow(1.055, rung - 1));
    if (rung === LADDER_SIZE) return { laurels, chest: "primordial", label: `${laurels} laurels + a Primordial chest` };
    if (isChampion(rung)) {
        const chest = rung >= 80 ? "mythic" : rung >= 50 ? "gold" : rung >= 20 ? "iron" : "wooden";
        return { laurels, chest, label: `${laurels} laurels + a ${chest[0].toUpperCase()}${chest.slice(1)} chest` };
    }
    return { laurels, label: `${laurels} laurels` };
}

/** One rung, fully resolved. `rung` is 1-based and matches the id, so nothing has to be looked up twice. */
export function ladderFoe(rung) {
    const n = Math.max(1, Math.min(LADDER_SIZE, Math.round(rung)));
    const house = HOUSES[Math.floor((n - 1) / 10)];
    const within = ((n - 1) % 10);
    const champion = isChampion(n);
    // The archetype rotates through the catalog rather than being random, so a given rung always fights the
    // same way and can be planned against — and a champion always takes the house's hardest shape.
    // The house index rides along for CHAMPIONS so they are not all the same shape. `within + 3` is constant
    // at the tenth of every house, so every champion on the road was a Wall — ten boss fights with one answer.
    const arch = ARCHETYPES[(champion ? within + 3 + Math.floor((n - 1) / 10) : within) % ARCHETYPES.length];
    // ── A CHAMPION IS NOT A POWER SPIKE ──────────────────────────────────────────────────────────────
    // It was +35% power, and that was the single worst discontinuity on the Road: rung 90 came out at 1,019
    // against rung 89's 731, so the DOORWAY into a house was harder than the entire house behind it. Walked
    // with a real loadout, rung 89 was a 56% fight and rung 90 was 13% — while rungs 91 through 99, all
    // stronger on paper, sat between 6% and 33%. A ladder that goes up, down, and up again is not a ladder.
    //
    // A champion is now exactly its rung's power. What makes it the tenth fight of a house is what it IS: the
    // house's hardest archetype (below) and a deeper kit — see the ability tier in arena.js, which is what
    // gives it moves the nine before it did not have. That is difficulty made of skills and strategy rather
    // than of a bigger number, which is the brief.
    const power = powerAt(n);
    return {
        id: `ladder:${n}`,
        rung: n,
        npc: true,
        ladder: true,
        champion,
        house: house.key,
        houseName: house.name,
        name: house.who[within],
        blurb: house.blurb,
        color: house.tint,
        // ── ONE FIGHTER PER RUNG ─────────────────────────────────────────────────────────────────────────
        // This shared one plate across the nine non-champions of each house, which made ten hand-written
        // names render as the same picture ten times — at exactly the moment somebody is choosing who to walk
        // up to. Every rung has its own full-body combat sprite now (scripts/gen-ladder-rungs.mjs), drawn
        // through the same pipeline as the Gauntlet tiers so a rung and a tier stand at the same scale in the
        // same ring. The house plate stays as the fallback: a missing file is a grey box, and a grey box on
        // the road is worse than a neighbour's face.
        sprite: `/images/arena/ladder/rung-${n}.webp`,
        spriteFallback: `/images/arena/ladder/${house.key}${champion ? "-champion" : ""}.webp`,
        archetype: arch.key,
        archetypeName: arch.name,
        tell: arch.tell,
        power,
        reward: ladderReward(n),
    };
}

/** The whole ladder, for the screen. Cheap — it is pure arithmetic over a hundred entries. */
export const LADDER = Array.from({ length: LADDER_SIZE }, (_, i) => ladderFoe(i + 1));

/** The houses, for grouping the screen without it having to know the shape of a rung. */
export const LADDER_HOUSES = HOUSES.map((h, i) => ({
    key: h.key, name: h.name, blurb: h.blurb, tint: h.tint, from: i * 10 + 1, to: i * 10 + 10,
}));

/** Parse a `ladder:<n>` target back to a rung, or 0 if it is not one. */
export const ladderRungOf = (target) =>
    (typeof target === "string" && target.startsWith("ladder:") ? Number(target.slice(7)) || 0 : 0);

/**
 * The ONE rung you may fight next: the lowest you have not put down. 0 once the whole road is behind you.
 *
 * It is a road, so you walk it. Skipping was possible for as long as the road existed — you could open the
 * hundredth fight on your first day — and while that was never the intent, it read as intentional because
 * nothing said otherwise and beaten rungs never greyed out (see the payout fix: `ladder_beaten` was empty for
 * everybody, so the screen had nothing to grey).
 *
 * DERIVED, never stored. A `next_rung` column would be a second copy of a fact `ladder_beaten` already holds,
 * and the two would disagree the first time a rung was awarded by any path but a win — the backfill did
 * exactly that for seven chests.
 *
 * Gaps are respected rather than punished. Members who skipped ahead while it was allowed KEEP those rungs:
 * the frontier steps over anything already beaten, so someone holding 1, 2, 4, 10 is sent to 3, and then
 * straight to 5 because 4 is already down. Nobody re-fights a rung they have beaten, and nobody loses one.
 */
export function nextRung(beaten) {
    const done = beaten instanceof Set ? beaten : new Set((beaten || []).map(Number));
    for (let n = 1; n <= LADDER_SIZE; n += 1) if (!done.has(n)) return n;
    return 0;
}
