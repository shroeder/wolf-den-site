// ── WHERE THE GUNS SIT ON A HULL ─────────────────────────────────────────────────────────────────────────────
// The Cannons track promised "more barrels in the broadside" and the broadside was an abstraction — a number in
// the HUD and shot appearing out of nowhere. Now every gun you own is drawn on your deck, so an upgrade is a
// thing you can point at and count.
//
// The hard part is that no two hulls put their gun deck in the same place: a sloop has one open well, a
// man-o'-war has three tiers of ports. So positions are DATA, per hull art id, in the same shape as
// deck-lines.js — and there is a placement tool at /marketplace/sailing/gun-lab that writes this table for you
// rather than making anyone count pixels by hand.
//
// Coordinates are fractions of the SPRITE BOX: x from the left, y from the TOP, both 0-1. Order matters — a
// ship with three guns draws the first three, so put the ports you most want visible first.

import { fleetDeck, boatDeck } from "@/lib/marketplace/deck-lines.js";
import { zoneBox } from "@/lib/marketplace/ship-zones.js";

/** Hand-placed ports, keyed by fleet art id or `boat:<tier>` for the player's own forms. */
export const GUN_PORTS = {
    // (Filled in from the gun lab. Anything missing falls back to the spread below, which is already usable —
    // the fallback puts guns along the hull's own deck line, so a new ship is never gunless.)
};

// EVERY HULL WORKS OUT OF THE BOX. Without this a ship with no hand-placed entry would simply have no cannons,
// which is a worse failure than slightly-off cannons: the feature would look broken rather than imprecise.
// Guns spread evenly across the middle of the hull, sitting on its own measured deck line.
// Eight to a deck and three decks: 24, comfortably over the fleet's biggest battery (The Last Harbour, 22).
// PER_ROW is the countability limit measured on the narrowest hull; ROW_GAP is a tier's height as a fraction
// of the sprite box, read off the man-o'-war's own painted gun decks.
const PER_ROW = 8;
const ROW_GAP = 0.068;
export const MAX_DRAWN = PER_ROW * 3;

function fallbackPorts(deckPct, n, art) {
    const drawn = Math.max(0, Math.min(MAX_DRAWN, n));
    if (!drawn) return [];
    const y0 = 1 - deckPct / 100;         // deck line is measured from the BOTTOM; y is from the top

    // -- THE BATTERY BELONGS TO THE HULL, NOT TO THE SPRITE BOX ------------------------------------
    // The spread used to be a fixed fraction of the whole square, and a ship does not fill its square:
    // there is transparent margin at both ends and the bow tapers. Rendered at nine guns that put the
    // outermost barrels off the timber and over open water, and at twenty-two it was most of a row.
    // The hull's own extent is measured -- ship-zone-maps.js has it for every hull in the game -- so
    // the rail is read rather than guessed. Inset a little at each end because the very tip of the box
    // is bowsprit and stern gallery, not gun deck.
    const hull = art ? zoneBox(art, "hull") : null;
    const mid = hull ? (hull.x + hull.w / 2) / 100 : 0.5;
    const rail = hull ? (hull.w / 100) * 0.84 : 0.68;

    const rows = Math.ceil(drawn / PER_ROW);
    const out = [];
    for (let r = 0; r < rows; r += 1) {
        const inRow = r === rows - 1 ? drawn - PER_ROW * r : PER_ROW;
        // -- TIERS GO DOWN THE SIDE, NOT UP INTO THE RIGGING --------------------------------------
        // The first cut stacked them upward and every ship past rank 15 had cannon hanging in its own
        // shrouds. A second gun deck is BELOW the first: the hull has a quarter of the sprite box of
        // depth under the deck line and that is where the painted gun ports already are -- see the
        // third rate, whose two rows of ports the battery now lands on. Lower tiers are also shorter,
        // because a hull narrows toward the waterline.
        const span = Math.min(rail, rail * (0.44 + inRow * 0.08)) * (1 - r * 0.12);
        const y = y0 + r * ROW_GAP;
        for (let i = 0; i < inRow; i += 1) {
            // A LONE gun does not sit dead amidships. The crew sprite stands at exactly 0.5 and a single
            // centred cannon lands behind it -- drawing order now keeps it visible, but a barrel
            // bisecting the captain still reads as a mistake. Nudged just off centre, which looks
            // deliberate whichever way the hull faces.
            const t = inRow === 1 ? 0.62 : i / (inRow - 1);
            out.push({ x: mid - span / 2 + t * span, y });
        }
    }
    return out;
}

/**
 * Hand-placed ports first, then the spread for anything they do not cover.
 *
 * -- A HALF-PLACED BATTERY USED TO SWALLOW THE REST OF THE GUNS ------------------------------------
 * The old note here said, approvingly, that "a twelve-gun man-o'-war with five placed ports draws five
 * rather than inventing seven". That is the same defect as the cap: the scene makes one aiming marker
 * per port, so those seven guns fired every round and could never be shot back at. Placements are a
 * REFINEMENT of where a barrel sits, not a statement of how many there are -- the gun lab is a phone
 * tool and a hull can easily be left part-placed. Anything past the placed ones falls back to the
 * spread, which is imprecise but present, and present is the half that matters.
 */
export function withPlaced(placed, deckPct, count, art = null) {
    if (!placed?.length) return fallbackPorts(deckPct, count, art);
    if (placed.length >= count) return placed.slice(0, count);
    return [...placed, ...fallbackPorts(deckPct, count, art).slice(placed.length)];
}

/**
 * The ports to draw for one ship.
 *
 * `art` is the fleet art id (or `boat:<tier>`), `deckPct` its deck line, `n` how many guns it actually has.
 * Returns `n` ports, always: see withPlaced for why a short hand-placed battery is topped up.
 */
export function gunPortsFor(art, deckPct, n) {
    const count = Math.max(0, Math.min(MAX_DRAWN, Math.floor(n) || 0));
    if (!count) return [];
    return withPlaced(GUN_PORTS[art], deckPct, count, art);
}

/** Convenience for the two callers that only have the ship, not its deck line. */
export const fleetGunPorts = (art, n) => gunPortsFor(art, fleetDeck(art), n);
export const boatGunPorts = (tier, n) => gunPortsFor(`boat:${tier}`, boatDeck(tier), n);
