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

    // -- PAST THE FLAGSHIP ------------------------------------------------------------------------
    // The twenty-five added past rank 15. These were read off the same contact sheet as the fifteen
    // above (scan-ship-zones.mjs --sheet, which draws the split this number makes), not guessed --
    // and they matter for more than the crew's feet now: scan-ship-zones ITERATES THIS TABLE, so a
    // hull with no line here gets no zone map, and a hull with no zone map has no tappable sails and
    // no tappable hull. That is exactly how these twenty-five shipped, and how GrayKitsune came to be
    // unable to hit the timber on a Revenue Cutter except by Reckoning. A new hull needs a line here.
    fleet_thorn: 30,
    fleet_assize: 30,
    fleet_hammerfall: 30,
    fleet_assurance: 30,
    fleet_boss_ash: 30,
    fleet_blockade: 30,
    fleet_sixtyfour: 30,
    fleet_verdict: 30,
    fleet_gallowglass: 30,
    fleet_boss_reprisal: 30,
    fleet_choir: 30,
    fleet_marigold: 30,
    fleet_court: 30,
    fleet_lamprey: 30,
    fleet_boss_marshal: 30,
    fleet_gravemouth: 30,
    fleet_widows: 30,
    fleet_pressgang: 30,
    fleet_undertow: 30,
    fleet_boss_fathom: 30,
    fleet_reckoning: 30,
    fleet_regret: 30,
    fleet_line: 30,
    fleet_seventeen: 30,
    // NOT A SHIP. The Last Harbour is a mooring wall of fused wrecks, and at 30 the split filed four
    // storeys of lit windows under "her canvas" — a player aiming at sails would have been tapping a
    // building. Raised until only the broken masts along its top are rigging.
    fleet_boss_harbour: 60,
};

/** The player's own boat, keyed by FORM tier (1-11). Mirrors the sailing scene's own deck placement. */
export const BOAT_DECK = { 1: 26, 2: 24, 3: 27, 4: 17, 5: 31, 6: 33, 7: 30, 8: 31, 9: 30, 10: 34, 11: 26 };

const FALLBACK = 30;
/** Deck line for a fleet hull's art id. */
export const fleetDeck = (art) => FLEET_DECK[art] ?? FALLBACK;
/** Deck line for one of the player's boat forms. */
export const boatDeck = (tier) => BOAT_DECK[tier] ?? FALLBACK;
