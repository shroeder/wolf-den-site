// ── THE HIGH SEAS · THE APPROACH ─────────────────────────────────────────────────────────────────────────────
// The narrow question this answers: what does it feel like to set sail ACTIVELY rather than setting a timer
// and walking away? So this module is the minute BEFORE a fight and nothing else —
//
//     underway  ->  a sail comes up on the horizon  ->  the masthead calls it  ->  you take the glass
//     what you can see depends on how close you dare get  ->  run her down, or hold your course
//
// ⚠️ THERE IS NO COMBAT IN HERE, AND THERE WAS. The first cut had its own resolver — zones, broadsides, a
// boarding check — which is a second engine answering a question ship-battle.js already answers, in numbers
// that would drift from the shipped ones the moment either was touched. Luke: "I also wanted to use the ship
// battle system that we already have." It is deleted, not disabled.
//
// ⚠️ AND NO AMMUNITION EITHER. Round, chain and grape were briefly a control here; Luke: "just unneeded
// complexity." Where you aim is enough, and it takes the accidental-sinking failure state with it — you
// cannot hole her by mistake when holing her is something you point at on purpose.
//
// ⚠️ IT IS A LAB. Owner-gated, and it touches no database, no voyage, no doubloons: a run lives in the
// browser and dies with the tab, which is what makes it free to argue with.
//
// The ship it spots carries her fighting shape in the SHIPPED ENGINE'S UNITS — planks off hullHitsFor, canvas
// off SAILS_MAX, a gun deck of GUN_HP barrels — so she can be handed straight to that battle when the two
// halves are joined, rather than being translated across a seam.
// ⚠️ THE ONE SWITCH, kept HERE in the pure file and read by highseas-gate.js, which is the half that knows
// about owners. Same shape as FOREST_PUBLIC and CARDS_PUBLIC: on the day this opens, one constant moves and
// the page, the menu and anything added later all follow, because none of them re-write the rule.
export const HIGHSEAS_PUBLIC = false;

import { SAILS_MAX, GUN_HP, hullHitsFor } from "@/lib/marketplace/ship-battle.js";

// ── A SEEDED SEA ─────────────────────────────────────────────────────────────────────────────────────────────
// Same seed, same ship, same captain, every time and on any machine — so "sail seed 41 and tell me what you
// think" means one conversation about one ship rather than two people describing different fights.
export function hash(a, b = 0) {
    let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x2545f491) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}
const pick = (arr, n) => arr[n % arr.length];
const between = (n, lo, hi) => lo + (n % (hi - lo + 1));

// ── WHAT IS OUT THERE ────────────────────────────────────────────────────────────────────────────────────────
// Three kinds, and the kind IS the decision. A trader is fat and feeble: easy to take, and her captain is
// nobody. A king's ship is the reverse — she will hurt you and there is nothing in the hold, but the man on her
// quarterdeck is worth the beating. The privateer sits between them so the choice is not always obvious.
//
// Art is the boat tiers, already drawn. Nothing new was generated for this.
export const KINDS = {
    trader:    { id: "trader",    label: "Merchantman", hold: [3, 5], infamy: [1, 2], guns: [2, 3], tone: "#8fd0a0" },
    privateer: { id: "privateer", label: "Privateer",   hold: [2, 4], infamy: [2, 4], guns: [4, 5], tone: "#e8c07a" },
    naval:     { id: "naval",     label: "King's ship", hold: [1, 2], infamy: [4, 5], guns: [5, 7], tone: "#9fd8ff" },
};

// ⚠️ THE BOAT ART, NOT THE FLEET ART. The fleet's forty hulls are Long Road ships — coral, flowers, arcane
// rigging — and dropped into a painted sunset beside the player's plain schooner they read as something from a
// different game. These are the same hulls the player's own boat is drawn from, so a sail on the horizon looks
// like a SHIP: the world stays one world, and her class is legible from her silhouette at distance, which is
// exactly what the telescope is asking you to read.
const HULLS = {
    trader: ["boat-tier1-wood", "boat-tier2-cutter"],
    privateer: ["boat-tier3-brig", "boat-tier4-schooner"],
    naval: ["boat-tier5-galleon", "boat-tier6-manowar"],
};

// ⚠️ THE FAR-RANGE READ HAS TO BE TRUE. It was the fixed string "three masts, square rigged" over whatever
// hull had been drawn, so the glass could tell you three masts while showing you a one-masted boat. The
// silhouette is the FIRST real information the telescope gives, and the whole point of the screen is that
// what you can see is honest and merely incomplete — one line that contradicts the picture costs the other
// four their credibility.
const SILHOUETTE = {
    "boat-tier1-wood": "a small open boat, one mast",
    "boat-tier2-cutter": "a cutter, single mast",
    "boat-tier3-brig": "two masts, square rigged",
    "boat-tier4-schooner": "two masts, fore and aft",
    "boat-tier5-galleon": "three masts, square rigged",
    "boat-tier6-manowar": "three masts, and a row of gunports",
};

const FIRST = ["Marigold", "Bittern", "Quiet", "Saint", "Black", "Fair", "Widow's", "Iron", "Sparrow", "Long"];
const SECOND = ["Wager", "Anne", "Errand", "Compass", "Lantern", "Tide", "Promise", "Reckoning", "Harrow", "Bell"];
const RANKS = ["Cpt.", "Cpt.", "Cdr.", "Adm."];
const SURNAMES = ["Vane", "Ashcroft", "Mourne", "Pell", "Garrow", "Quint", "Halloran", "Strand", "Coyne", "Rook"];

/** The cargo a hold can be full of. Flavour in the lab; the real thing would roll real goods. */
const CARGO = ["sugar and rum", "bolts of silk", "powder and shot", "salt cod", "coin for a garrison", "spices"];

/**
 * The ship the lookout has just seen. Everything about her is decided here, at the moment she appears —
 * so the telescope is REVEALING something that is already true rather than rolling it as you look.
 */
export function spot(seed, index = 0) {
    const n = hash(seed, index);
    const kindId = pick(["trader", "trader", "privateer", "privateer", "naval"], n >>> 3);
    const kind = KINDS[kindId];
    const infamy = between(n >>> 7, kind.infamy[0], kind.infamy[1]);
    const guns = between(n >>> 11, kind.guns[0], kind.guns[1]);
    const hull = pick(HULLS[kindId], n >>> 5);
    return {
        id: `${seed}:${index}`,
        kind: kindId,
        label: kind.label,
        tone: kind.tone,
        hull,
        art: `/images/sailing/${hull}.png`,
        silhouette: SILHOUETTE[hull] || "a sail, hull down",
        name: `The ${pick(FIRST, n >>> 13)} ${pick(SECOND, n >>> 17)}`,
        captain: `${pick(RANKS, infamy)} ${pick(SURNAMES, n >>> 19)}`,
        infamy,
        hold: between(n >>> 23, kind.hold[0], kind.hold[1]),
        cargo: pick(CARGO, n >>> 27),
        // Her fighting shape, in the shipped engine's units.
        planks: hullHitsFor(Math.max(0, infamy - 1)),
        sails: SAILS_MAX,
        guns: Array.from({ length: guns }, () => GUN_HP),
    };
}

// ── THE TELESCOPE ────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ IT IS A BEAT, NOT A MINIGAME, AND IT USED TO BE THE OTHER THING. There were three ranges — hull down,
// within the glass, hailing distance — each revealing another line, with a "closer look" that risked her
// seeing you and making sail. Luke: "the whole discovery mini game ... I don't think it needs to be a
// minigame. It's just a fun way for you to go from beat to beat."
//
// He is right, and the mechanic was a fake decision besides: the information was worth far more than the small
// chance she ran, so closing was always correct and the button was a tax on knowing that. A choice only one
// answer survives is a loading screen with a button on it.
//
// So the glass shows her, all of her, at once. What it is FOR is the moment — you were sailing, somebody
// called out, and now you are looking at a ship and deciding. The decision that matters is the next one.

/** What her waterline tells you before anything else does — laden or riding high. */
export const waterline = (ship) => (ship.hold >= 4 ? "heavy in the water" : ship.hold >= 3 ? "riding low" : "riding high");

// ── AND HERE THE EXISTING GAME TAKES OVER ────────────────────────────────────────────────────────────────────
// There was a whole combat resolver below this line — zones, broadsides, a boarding check — and it is gone.
// Luke: "I also wanted to use the ship battle system that we already have." He is right, and a second engine
// would have been the worst kind of prototype: one that answers a question already answered, in numbers that
// drift from the shipped ones the moment either is touched.
//
// ship-battle.js already models the two things this design needs — her RIGGING and her GUN DECK as separate
// systems you can shoot at, with a hull that only takes planks when something aimed at it. "Strip her canvas,
// silence her guns, leave her floating" is expressible there today. What was missing was never the fight. It
// was the minute in front of it: being underway, being called to, and choosing whether to look.
//
// So this module stops at the approach, which is the only part that is genuinely new.
