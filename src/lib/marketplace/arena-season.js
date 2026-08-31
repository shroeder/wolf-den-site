// ── THE ROAD IS A SEASON ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "my next goal is to make the road seasonal behind a gate so I can test it. the road will no longer
// reward each rungs completion with so many laurels and gold, it will still award class exp on each rung. and
// the season will have season exclusive rewards for each 25 rungs, totalling 8. Last of which rung 200."
//
// WHAT CHANGED, AND WHY IT IS THE WHOLE POINT. The Road used to pay for every rung — laurels on a curve, gold
// off the foe's power, a chest every tenth. That made it an INCOME, and an income has to be balanced against
// every other income in the Den, which is how it ended up nerfed twice (see the two tombstones in
// arena-ladder.js: the laurel exponential that paid 48 million, and the chest table that out-gave every other
// source in the game combined).
//
// A season does not have that problem, because what it pays cannot be earned anywhere else and cannot be
// earned again. Eight things, once a season, and the only way to them is up. That is a reason to climb that
// does not touch the economy at all — the eight prizes are worth exactly as much as the climb is hard, and
// nothing else in the game has to be re-balanced around them.
//
// So the per-rung payout is deliberately small and FLAT (see ROAD_LAURELS_PER_RUNG): enough that a rung is not
// nothing, too little to be farmed, and identical at rung 3 and rung 197 so it can never run away again.
//
// ── PURE ────────────────────────────────────────────────────────────────────────────────────────────────────
// No database, no server-only. The Road screen draws the milestone track off this, the server grants off this,
// and the gate script checks it — one table, so what a member is shown they are about to win is the thing the
// grant code actually hands over.

// ── THE SHAPE OF A SEASON ────────────────────────────────────────────────────────────────────────────────────
// Eight prizes, every twenty-five rungs, ending at the summit. Written as a derived list rather than typed out
// so a prize can never land on a rung the Road does not have — MILESTONE_RUNGS is generated from the Road's own
// length, and a season whose prize list disagrees is caught by `npm run check:season` rather than by a member.
export const MILESTONE_EVERY = 25;
export const MILESTONE_COUNT = 8;
export const MILESTONE_RUNGS = Array.from({ length: MILESTONE_COUNT }, (_, i) => (i + 1) * MILESTONE_EVERY);

/** Is this rung one of the eight? */
export const isMilestoneRung = (rung) => Number(rung) > 0 && Number(rung) % MILESTONE_EVERY === 0
    && Number(rung) <= MILESTONE_EVERY * MILESTONE_COUNT;

// ── WHAT A RUNG PAYS NOW ─────────────────────────────────────────────────────────────────────────────────────
// Flat, laurels only. No gold — the Road is out of the mint entirely, which is a thing it should never have
// been in: a rung is a one-off, so it cannot be a wage, and the 27,825 gold it minted was accounted for as
// arena income that could not be repeated by anyone who had already walked it.
//
// No chest either. The chests WERE the Road's real payout and they are exactly what a season prize replaces:
// a rolled crate is a lottery ticket, and the eight prizes below are named things you can see coming.
export const ROAD_LAURELS_PER_RUNG = 25;

// ── THE FOUR KINDS ───────────────────────────────────────────────────────────────────────────────────────────
// One of each, twice. `grant` names the function that actually hands it over — kept here beside the kind so
// that adding a fifth kind of prize is one row in this table and one import at the grant site, rather than a
// new branch in a switch somebody has to find.
// `glyph` is a react-icons/gi component NAME, resolved by the screen. Never an emoji — the Den does not put
// emoji in its interface, and a prize tile is exactly the place a stray one would look cheapest.
export const PRIZE_KINDS = {
    decoration: { label: "Decoration", glyph: "GiFlowerPot", blurb: "A farm piece nobody outside this season can own." },
    recipe: { label: "Recipe", glyph: "GiCookingPot", blurb: "A page for the book, cookable forever." },
    gear: { label: "Gear", glyph: "GiBroadsword", blurb: "A piece you keep, wear and forge like any other." },
    pet: { label: "Pet", glyph: "GiPawPrint", blurb: "A companion that only ever walked this Road." },
};

// ── THE SEASONS ──────────────────────────────────────────────────────────────────────────────────────────────
// `from` is the Chicago calendar date the season opens on. There is no `to`: a season runs until the next one
// starts, and the last one in the list runs until somebody writes another. That is deliberate — a window with
// an end date has a GAP after it, and the first thing a gap does is leave the Road with no season, no prize
// table and no answer for what a rung is worth. There is always a current season.
//
// ⚠️ A SEASON'S PRIZE IDS ARE PERMANENT. `mkt_arena_road_prize` records what was handed over by id, and a
// member's pet, recipe, gear and decoration all live in their own tables keyed the same way. Editing a past
// season's refs does not take anything back — it makes the record lie about what somebody has. Add a season;
// never rewrite one that has run.
export const SEASONS = [
    {
        n: 1,
        key: "open_gate",
        name: "The Open Gate",
        // The Road's first ten houses climb from a tavern yard to a throne room, and the eleventh is a door
        // somebody has been holding shut from the far side. The season is named for it because that is the
        // shape of the climb: everything before rung 100 is the world, and everything after is what was
        // outside it.
        blurb: "Something has been leaning on the far side of it for a long while.",
        tint: "#8fd0ff",
        from: "2026-08-29",
        prizes: [
            { rung: 25, kind: "decoration", ref: "deco_s1_milestone", name: "Milestone Stone",
              blurb: "Carved with a number nobody remembers choosing." },
            { rung: 50, kind: "recipe", ref: "r_s1_walkers_stew", name: "Walker's Ember Stew",
              blurb: "Cooked on the coals you were already carrying." },
            { rung: 75, kind: "gear", ref: "s1_roadwardens_mantle", name: "The Roadwarden's Mantle",
              blurb: "Heavy at the shoulder. It has been rained on for years." },
            { rung: 100, kind: "pet", ref: "road_cur", name: "Roadside Cur",
              blurb: "Started following you around rung nine and never stopped." },
            { rung: 125, kind: "decoration", ref: "deco_s1_signpost", name: "The Turned Signpost",
              blurb: "Every arm points back the way you came." },
            { rung: 150, kind: "recipe", ref: "r_s1_nightwatch_board", name: "The Nightwatch Board",
              blurb: "Cut cold, for people whose whole job is staying awake." },
            { rung: 175, kind: "gear", ref: "s1_hinge_iron_greaves", name: "Hinge-Iron Greaves",
              blurb: "Cut from the pin the door turned on." },
            { rung: 200, kind: "pet", ref: "gate_moth", name: "The Doorward's Moth",
              blurb: "It was on the other side. Now it is on this one." },
        ],
    },
];

// ── WHICH SEASON IS RUNNING ──────────────────────────────────────────────────────────────────────────────────
// Compared as Chicago CALENDAR DATES, not as instants. The Den's day boundary is Chicago midnight everywhere
// else (see the DAY constant in arena.js), and a season that rolled over at UTC midnight would start five or
// six hours early depending on the time of year — a difference that only shows up twice a year and only in
// production, which is the worst kind.
//
// ISO dates string-compare in the right order, so no parsing is needed and no Date arithmetic can drift.
const CHICAGO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
});
export const denDate = (when = new Date()) => CHICAGO.format(when);

/** The season running on a given day. Never null — the last authored season runs on past its own dates. */
export function seasonAt(when = new Date()) {
    const today = typeof when === "string" ? when : denDate(when);
    let found = SEASONS[0];
    for (const s of SEASONS) if (s.from <= today) found = s;
    return found;
}

/** The season running right now. */
export const currentSeason = () => seasonAt();

export const seasonByNumber = (n) => SEASONS.find((s) => s.n === Number(n)) || null;

/** The day the season AFTER this one opens, or null while it is the last authored one. */
export function seasonEnds(season) {
    const next = SEASONS.find((s) => s.n === Number(season?.n) + 1);
    return next ? next.from : null;
}

/** The prize sitting on a rung this season, or null. */
export function prizeAt(rung, season = currentSeason()) {
    const n = Number(rung) || 0;
    return (season?.prizes || []).find((p) => p.rung === n) || null;
}

/** The next prize above a rung — what the track should be pointing at. Null once all eight are behind you. */
export function nextPrizeAfter(rung, season = currentSeason()) {
    const n = Number(rung) || 0;
    return (season?.prizes || []).find((p) => p.rung > n) || null;
}

/**
 * The whole milestone track, ready for the screen.
 *
 * `claimed` is the set of rungs this member has already been paid for — read off mkt_arena_road_prize rather
 * than inferred from `beaten`, because those two CAN disagree and the difference matters: a prize whose grant
 * failed (a pet table down, a decoration id that moved) leaves a rung beaten and unpaid, and the track has to
 * show that as unpaid so the repair sweep has something to find. Inferring it from the rung would have drawn
 * a prize the member does not own.
 */
export function milestoneTrack({ season = currentSeason(), beaten = 0, claimed = null, reach = 200, art = null } = {}) {
    const got = claimed instanceof Set ? claimed : new Set((claimed || []).map(Number));
    const pics = art || {};
    return (season.prizes || []).map((p) => ({
        ...p,
        ...PRIZE_KINDS[p.kind],
        kind: p.kind,
        // The prize's OWN picture, when it has been drawn. Null falls the tile back to its kind glyph, which
        // is what a season looks like between authoring its prizes and running gen:season-art — a legend
        // rather than a preview, but never a gap.
        art: pics[p.ref] || null,
        claimed: got.has(p.rung),
        // Reached but unpaid — see the note above. Drawn differently so it reads as owed, not as locked.
        owed: !got.has(p.rung) && Number(beaten) >= p.rung,
        // Beyond the road this member may walk at all (they have not bought The Long Road), so it is not
        // merely far away — it is behind a second door, and saying so is kinder than a lock with no reason.
        beyond: p.rung > Number(reach),
        rungsAway: Math.max(0, p.rung - Number(beaten)),
    }));
}

/** One line for a card: "3 of 8 claimed". */
export const trackSummary = (track) => ({
    claimed: track.filter((t) => t.claimed).length,
    owed: track.filter((t) => t.owed).length,
    total: track.length,
});

// ── ONE SWITCH FOR THE WHOLE SEASON ──────────────────────────────────────────────────────────────────────────
// Luke: "make the road seasonal behind a gate so I can test it."
//
// ONE flag, not two, and that is the point. A season has a DOOR (can you fight a rung) and a SHELF (can you
// see the eight things you are climbing towards), and those are separate code paths in separate files — the
// arena's challenge handler and the farm's catalog drawer have never heard of each other. Gate them with two
// booleans and the first mistake anybody makes is flipping one: either the Road opens onto prizes nobody can
// see, or the whole membership browses eight exclusives behind a door that is still shut.
//
// So both read this. `ROAD_OPEN` in arena.js is assigned from it, and every season-exclusive row in the four
// catalogs takes `unreleased: !SEASON_PUBLIC`. Flip this one line and the season is live everywhere at once.
//
// The owner is exempt from the door regardless (roadOpenFor), which is what makes it testable: Luke can walk
// the Road and collect prizes on the live site while it reads as not existing to everybody else.
// OPEN 2026-08-31. One flip does all of it: the Road becomes walkable by the whole Den, the eight prizes come
// out of hiding in four catalogues, and every member's rungs roll into Season 1 the first time they open the
// Arena (see rollRoadSeason — lazily, one row at a time, archiving as it goes so nobody's climb is lost).
//
// Checked before flipping, because this is the whole Den rather than one account: all eight prizes resolve,
// all eight are drawn, all eight have inspect details. The ladder itself was rebuilt the same night — coherent
// fighters, a height-weighted archetype draw — and measured across the three best-geared members, every band
// is harder than the one below it for all three.
export const SEASON_PUBLIC = true;

/** `unreleased` for a season-exclusive catalog row. Kept here so the four catalogs cannot drift apart. */
export const SEASON_HIDDEN = !SEASON_PUBLIC;
