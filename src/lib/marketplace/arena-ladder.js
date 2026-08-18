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
// GROWTH 16.5% -> 3.3% a rung. THIS IS THE ONE THAT WAS BROKEN, and it was broken in a way arithmetic hides:
// an exponential does not look wrong at the rung you are testing, it looks wrong ninety rungs later.
//
// At 16.5% the ladder outran the game. A member's gear budget stops at 644 — that is best-in-slot, everything
// equipped, nothing left to buy — and the curve passed it at rung 21 and kept going. Rung 100's fighter had a
// power budget of TWO HUNDRED AND SIXTEEN MILLION. Simulated against a real best-in-slot fighter through the
// real engine (scripts/sim-road.mjs, 250 bouts a cell):
//
//     rung 25  won 64%        rung 30  won  5%        rung 40  won 1%        rung 50+  won 0%
//
// So seventy-five of the hundred rungs were not "future content", which is what the note here used to call
// them. There is no future gear past 644. They were decoration on a wall nobody could ever climb, and the
// member walking into rung 30 was one-shot by a fighter with nine times his health and eight times his crit
// multiplier. Luke, finding it from the inside: "the road is really messed up and everything's overtuned right
// now, I'm getting one shot instantly on rung 30."
//
// 3.3% is the rate that makes the whole ladder reachable, chosen by simulating the alternatives rather than by
// picking a number that felt calmer — 3.0% left the summit free (best-in-slot won 57% at rung 100) and 4.2%
// put it back out of reach (2%). At 3.3%, measured the same way:
//
//     rung 50   fresh 99%   mid 100%   best-in-slot 100%
//     rung 75   fresh 55%   mid  96%   best-in-slot 100%
//     rung 100  fresh  2%   mid   4%   best-in-slot  32%
//
// Which is the shape a hundred-rung ladder is supposed to have: a fresh fighter's journey ends around the
// seventies, the summit is a real wall, and a maxed fighter beats it about a third of the time — with a good
// element matchup, the right consumables and a clean run turning that into a win rather than a coin toss.
//
// WHAT THIS COSTS, stated plainly because it is a real trade. A geared member now clears the low rungs quickly
// instead of stalling at 20. That is the correct direction for a ladder you climb from the bottom — the early
// rungs are a warm-up you walk through once — but it does mean the middle of the Road is not where the fight
// is. The fight is rungs 80-100, and that is deliberate.
//
// Re-run scripts/sim-road.mjs after touching FLOOR, GROWTH, HOUSE_STEP, the champion multiplier, ladderDr, or
// anything in statsForPower. All six land on this table.
const FLOOR = 30;
const GROWTH = 1.033;

// ── AND A STEP AT EVERY GATE ─────────────────────────────────────────────────────────────────────────────────
// A smooth exponential has no landmarks: rung 41 is 16% harder than 40 and so is every other pair, so the ten
// houses are ten names over one unbroken slope. Each house now costs a step to walk into on top of the curve,
// which is what makes arriving at The Deep feel like arriving somewhere — and gives a member a natural place
// to stop, go and build, and come back.
const HOUSE_STEP = 0.05;

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
export const LADDER_SIZE = 100;

const powerAt = (rung) => Math.round(FLOOR * Math.pow(GROWTH, rung - 1)
    * (1 + HOUSE_STEP * Math.floor((rung - 1) / 10)));

// A champion (every tenth) is a step above its own rung — the house's name is on it.
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
    // A champion was 18% over the rung below, which after a chest and a name reads as "the same fight again".
    // 35% is a fighter you have to come back for, which is what the tenth of a house should be.
    const power = Math.round(powerAt(n) * (champion ? 1.35 : 1));
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
