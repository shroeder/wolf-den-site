// ── WHERE THE DECK IS ON EACH HULL ───────────────────────────────────────────────────────────────────────────
// A crew sprite has to stand ON its ship, and every hull puts its deck somewhere different inside the square
// sprite: a sloop is mostly sail with the boat low in the frame, a man-o'-war fills it. One global percentage
// was the first attempt and it could not work — at 32% the cutter's captain stood correctly and the sloop's
// smuggler floated a body-length above his own boat.
//
// So it is DATA, one number per hull: the deck line as a percentage of the sprite's height measured from the
// BOTTOM, i.e. where a standing figure's feet belong. Read off a contact sheet of all fifteen hulls with the
// crew composited at real size, then re-checked the same way after tuning.
//
// Pure and shared on purpose: the battle scene (client) and the battle's meta (server-only sailing.js) both
// need these, and a second copy of the table is a second thing to forget when a hull is redrawn.

/** Fleet hulls, keyed by their art id (fleet.js `art`). */
export const FLEET_DECK = {
    fleet_cutter: 32,
    fleet_sloop: 22,          // low boat, tall sail — the one that gave the floating captain away
    fleet_lugger: 30,
    fleet_brig: 32,
    fleet_boss_revenge: 32,
    fleet_schooner: 24,       // twin masts, hull sits low in the frame
    fleet_corvette: 32,
    fleet_frigate: 30,
    fleet_heavy: 30,
    fleet_boss_tithe: 30,
    fleet_razee: 30,
    fleet_ghost: 32,
    fleet_bomb: 28,
    fleet_manowar: 34,        // fills its frame, deck sits high
    fleet_boss_sovereign: 34,
};

/** The player's own boat, keyed by FORM tier (1-11). Mirrors the sailing scene's own deck placement. */
export const BOAT_DECK = { 1: 26, 2: 24, 3: 27, 4: 17, 5: 31, 6: 33, 7: 30, 8: 31, 9: 30, 10: 34, 11: 26 };

const FALLBACK = 30;
/** Deck line for a fleet hull's art id. */
export const fleetDeck = (art) => FLEET_DECK[art] ?? FALLBACK;
/** Deck line for one of the player's boat forms. */
export const boatDeck = (tier) => BOAT_DECK[tier] ?? FALLBACK;
