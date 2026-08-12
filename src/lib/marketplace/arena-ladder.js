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
// Rung 1 sits under a fresh member and rung 100 sits well past the best gear in the game. Exponential rather
// than linear, so the early climb is quick and the top is genuinely a wall.
const FLOOR = 140;
const CEILING = 26000;
export const LADDER_SIZE = 100;

const powerAt = (rung) => Math.round(FLOOR * Math.pow(CEILING / FLOOR, (rung - 1) / (LADDER_SIZE - 1)));

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
    const arch = ARCHETYPES[(champion ? within + 3 : within) % ARCHETYPES.length];
    const power = Math.round(powerAt(n) * (champion ? 1.18 : 1));
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
        // Champions wear their house's own portrait; the rest share the house plate. One image per house
        // rather than a hundred, because a hundred sprites is a hundred generations and these are a ladder,
        // not a collection.
        sprite: `/images/arena/ladder/${house.key}${champion ? "-champion" : ""}.webp`,
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
