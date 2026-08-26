import { ARCHETYPES, npcBuild } from "@/lib/marketplace/arena-npc.js";

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
    // ═══ THE LONG ROAD · RUNGS 101-200 ════════════════════════════════════════════════
    // Ten houses that do not exist for anybody who has not bought The Long Road (100,000 chips, at the
    // Counter). They are IN this array rather than a separate one — unlike the deep fish and the master
    // recipes — because a rung is DERIVED from its number, and splitting the list would mean two versions of
    // ladderFoe(). The gate is on the SIZE instead: ladderSize() decides how much of this road a member can
    // see or walk, and every function that resolves a rung takes it. See the note on LADDER_SIZE.
    //
    // The first ten houses climb from a tavern yard to a throne room. These ten leave the world: the Crown is
    // the last house with a door on it, and everything past rung 100 is what was on the other side.
    {
        key: "gate", name: "The Gate", blurb: "Something has been keeping this shut from the far side.",
        tint: "#8fd0ff",
        who: ["The Doorward", "Hinge", "Lintel", "The Turnkey's Widow", "What Leans On It",
            "Sill", "The Second Bolt", "Keeper of the Latch", "The Long Hinge", "THE GATE ITSELF"],
    },
    {
        key: "waste", name: "The Waste", blurb: "Nothing grows. Things still live.",
        tint: "#c2a06a",
        who: ["Saltwalker Ib", "The Thirst", "Glassfoot", "Nine Days Out", "The Cairn-Builder",
            "Rust Mother", "What The Wind Left", "The Last Well", "Sanddrinker", "THE WASTE ENTIRE"],
    },
    {
        key: "choir", name: "The Choir", blurb: "They are certain, and they are armed.",
        tint: "#ffd98a",
        who: ["Novice Ansel", "The Second Verse", "Censer-Bearer Ott", "She Who Holds The Note", "The Descant",
            "Bell-Ringer Var", "The Silent Brother", "Cantor Imre", "The Hundredth Psalm", "THE CHOIRMASTER"],
    },
    {
        key: "vault", name: "The Vault", blurb: "Somebody sealed these in on purpose.",
        tint: "#9fb3c8",
        who: ["Exhibit Four", "The Mislabelled", "What The Ledger Skips", "Case Nineteen", "The Quiet Room",
            "Specimen Ninety", "The Curator's Regret", "Held Pending Review", "The Bottom Shelf", "THE ACCESSION"],
    },
    {
        key: "storm", name: "The Storm", blurb: "Weather that came looking for you.",
        tint: "#6bb8ff",
        who: ["Squall", "The Barometer", "Nine-Mile Wind", "The Eye", "Hailbringer",
            "What Rides The Front", "The Standing Wave", "Thunderhead", "The Last Dry Thing", "THE WHOLE SKY"],
    },
    {
        key: "hollow", name: "The Hollow", blurb: "It is not that they want something. They are the wanting.",
        tint: "#7d6a9c",
        who: ["The Ache", "Second Helping", "What Was Left Of Rill", "The Open Mouth", "Never Enough",
            "The Guest", "Hollow Cousin", "It Remembers Being Fed", "The Long Fast", "THE HUNGER ITSELF"],
    },
    {
        key: "orrery", name: "The Orrery", blurb: "Machinery that was told to keep going.",
        tint: "#b08aff",
        who: ["Escapement", "The Third Gear", "Counterweight", "Mainspring Nine", "The Wound Thing",
            "Detent", "What Still Ticks", "The Broken Tooth", "The Last Revolution", "THE GREAT WHEEL"],
    },
    {
        key: "dark", name: "The Long Dark", blurb: "The distance between everything.",
        tint: "#4a5570",
        who: ["Parallax", "The Cold Between", "What Never Arrived", "Drift", "The Far Side Of It",
            "Umbra", "The Unlit Mile", "Nothing In Particular", "The Long Fall", "THE DARK ENTIRE"],
    },
    {
        key: "first", name: "The First", blurb: "They were here before the road was.",
        tint: "#5ddc9a",
        who: ["The Older Name", "What The Stone Copied", "Before The Yard", "The Original Wound", "Root Of It",
            "The Elder Shape", "It Taught Us Fighting", "The First Grudge", "Oldest Standing", "THE FIRST OF ALL"],
    },
    {
        key: "sun", name: "The Sun", blurb: "The end of the road, and it is bright.",
        tint: "#ffe9b0",
        who: ["Corona", "The Near Light", "What Casts No Shadow", "Noon Absolute", "The White Hour",
            "Unblinking", "The Last Warmth", "It Does Not Set", "The Final Degree", "THE SUN ITSELF"],
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
// ── THE CURVE IS A CLIMB, AND EVERY RUNG IS A STEP ───────────────────────────────────────────────────────────
// Third shape, and this one is chosen from the thing the Road is actually FOR: it is a readout of your power.
// You fail a rung, you go and improve something, you come back and get past the fighter that stopped you. That
// only works if the exchange rate between stats and rungs is roughly constant — a few percent of gear should
// always be worth about a rung.
//
// The exponential failed because it ran away. The logistic that replaced it failed the other way: it flattened
// at the top, so rungs 68 to 88 sat within half a percent of each other. Measured by sweeping a real loadout
// (scripts/sim-road-progress.mjs), that produced the worst possible feel — a 44% gear increase bought ZERO
// rungs, and then the next upgrade leapt twenty at once. Progress in lurches is barely better than no progress,
// because neither one answers "did that upgrade do anything".
//
// So: a constant PERCENTAGE per rung, in two stretches, because one rate cannot serve both ends. The gap
// between a brand-new fighter and a fully equipped one is about tenfold, and a hundred rungs of constant rate
// across that gap makes the first rung a wall.
//
//   RUNGS 1-30    +10.9% a rung. The climb out of nothing. A new member gains power quickly, so the ladder is
//                 allowed to as well, and this is the stretch where a single piece of gear is transformative.
//   RUNGS 30-100  +1.39% a rung. The long haul. SOLVED, not guessed: gear converts to fighting power
//                 sub-linearly, so the roughly sixfold gear climb still ahead of the best-equipped member is
//                 worth well under sixfold in the ring. The rate is set so that climb lands the summit exactly
//                 — every slot at the top tier, fully forged, and rung 100 is an even fight. First cut of this
//                 used 2.35% and topped out at rung 77 with everything maxed, which would have made the last
//                 twenty-three rungs decoration again.
//
// At 1.39% a rung, about 3% more gear is worth a rung: one upgraded piece moves you one or two fighters, every
// time. Never nothing, never twenty. Crossing the back seventy is a year of upgrading, which is the intent.
// ── HOW MUCH ROAD THERE IS ─────────────────────────────────────────────────────────
// LADDER_SIZE is what EVERYBODY can walk. LADDER_MAX is what exists. The hundred rungs between them are The
// Long Road, bought once for 100,000 chips, and until it is bought they are not merely hidden — they do not
// resolve. Luke: "ensure it's hidden until unlock and doesn't allow anyone to get past 100 until it's
// unlocked."
//
// TWO CONSTANTS RATHER THAN A FLAG, because the curve has to keep running past 100 for rungs 101-200 to have
// sensible power at all: powerAt and ladderDr clamp to LADDER_MAX so the maths is continuous, and the GATE
// lives in ladderSize() — the one function every caller asks how far this member may go. A ceiling enforced
// in the maths would have made rung 101 a copy of rung 100; a ceiling enforced in the UI would have been no
// ceiling at all.
export const LADDER_SIZE = 100;
export const LADDER_MAX = 200;

/** How far THIS member's road runs. The single gate — see the note above. */
export const ladderSize = (long = false) => (long ? LADDER_MAX : LADDER_SIZE);
const FLOOR = 30;
const KNEE = 30;         // where the newcomer's ramp hands over to the long haul
const RAMP = 1.109;      // per-rung growth below the knee
const TAIL = 1.0139;     // per-rung growth above it — the number that decides how long the endgame is

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
    const house = Math.floor((Math.max(1, Math.min(LADDER_MAX, Math.round(rung))) - 1) / 10);
    // 4% in the Yard, 29% at the Crown, and on up to 57% at the Sun.
    return Math.round((0.04 + house * 0.028) * 1000) / 1000;
};

// One rate below the knee, another above it, and nothing else — no house step, no champion multiplier. Two
// neighbouring rungs are always the same distance apart in percentage terms, which is the whole point.
const powerAt = (rung) => {
    const r = Math.max(1, Math.min(LADDER_MAX, Math.round(rung)));
    const ramp = Math.pow(RAMP, Math.min(r, KNEE) - 1);
    const tail = Math.pow(TAIL, Math.max(0, r - KNEE));
    return Math.round(FLOOR * ramp * tail);
};

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
    // BOTH summits pay a Primordial. Rung 100 keeps the one it always paid — moving it to 200 would take
    // something away from everyone who has already earned it — and rung 200 is worth no less.
    if (rung === LADDER_SIZE || rung === LADDER_MAX) return { laurels, chest: "primordial", label: `${laurels} laurels + a Primordial chest` };
    if (isChampion(rung)) {
        const chest = rung >= 170 ? "celestial" : rung >= 140 ? "eternal" : rung >= 110 ? "ascendant"
            : rung >= 80 ? "mythic" : rung >= 50 ? "gold" : rung >= 20 ? "iron" : "wooden";
        return { laurels, chest, label: `${laurels} laurels + a ${chest[0].toUpperCase()}${chest.slice(1)} chest` };
    }
    return { laurels, label: `${laurels} laurels` };
}

/** One rung, fully resolved. `rung` is 1-based and matches the id, so nothing has to be looked up twice. */
export function ladderFoe(rung) {
    const n = Math.max(1, Math.min(LADDER_MAX, Math.round(rung)));
    const house = HOUSES[Math.floor((n - 1) / 10)];
    const within = ((n - 1) % 10);
    const champion = isChampion(n);
    // The archetype rotates through the catalog rather than being random, so a given rung always fights the
    // same way and can be planned against — and a champion always takes the house's hardest shape.
    // The house index rides along for CHAMPIONS so they are not all the same shape. `within + 3` is constant
    // at the tenth of every house, so every champion on the road was a Wall — ten boss fights with one answer.
    const arch = ARCHETYPES[(champion ? within + 3 + Math.floor((n - 1) / 10) : within) % ARCHETYPES.length];
    // The whole character behind this rung, so the card can name what it carries rather than only its shape.
    const build = npcBuild(n);
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
        // ── WHO YOU ARE ACTUALLY WALKING UP TO ───────────────────────────────────────────────────────────
        // The archetype is a shape and the tell is a mood; neither says what the fighter CARRIES. A bout
        // resolves in seconds, so the only place a member can make a decision is before it, and a foe whose
        // affixes you cannot see is a coin toss wearing a portrait. npcBuild is the whole character — class,
        // tree, gear, affixes — and  is the two or three facts worth shouting across the sand.
        className: build.className,
        classId: build.classId,
        points: build.points,
        tells: build.tells,
        power,
        reward: ladderReward(n),
    };
}

/** The whole ladder, for the screen. Cheap — it is pure arithmetic over a hundred entries. */
// The whole road, resolved once. Callers must slice it to the member's own size rather than reading it
// straight — see ladderFor(), which is the only thing that should ever be handed to a client.
export const LADDER = Array.from({ length: LADDER_MAX }, (_, i) => ladderFoe(i + 1));

/** The rungs this member may see. The slice IS the secrecy — nothing downstream filters. */
export const ladderFor = (long = false) => LADDER.slice(0, ladderSize(long));

/** The houses, for grouping the screen without it having to know the shape of a rung. */
/** The houses this member may see. Ten, or twenty. */
export const ladderHousesFor = (long = false) => LADDER_HOUSES.slice(0, long ? 20 : 10);

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
// `size` is how far THIS member may walk — ladderSize(long). Returning 0 at the end of their road is what
// stops rung 101: the challenge path refuses anything that is not exactly nextRung, so somebody who has
// beaten all hundred and has not bought The Long Road can be offered nothing at all. Not greyed out on a
// screen — unfightable on the server, which is the only place it counts.
export function nextRung(beaten, size = LADDER_SIZE) {
    const done = beaten instanceof Set ? beaten : new Set((beaten || []).map(Number));
    for (let n = 1; n <= size; n += 1) if (!done.has(n)) return n;
    return 0;
}
