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

/** Hand-placed ports, keyed by fleet art id or `boat:<tier>` for the player's own forms. */
export const GUN_PORTS = {
    // (Filled in from the gun lab. Anything missing falls back to the spread below, which is already usable —
    // the fallback puts guns along the hull's own deck line, so a new ship is never gunless.)
};

// EVERY HULL WORKS OUT OF THE BOX. Without this a ship with no hand-placed entry would simply have no cannons,
// which is a worse failure than slightly-off cannons: the feature would look broken rather than imprecise.
// Guns spread evenly across the middle of the hull, sitting on its own measured deck line.
function fallbackPorts(deckPct, n) {
    const y = 1 - deckPct / 100;          // deck line is measured from the BOTTOM; y is from the top
    // The battery widens with the number of guns, and THE SPREAD STOPS AT EIGHT. Past that the even spacing packs barrels tighter than they can be drawn and a
    // thirteen-gun broadside renders as one dark fringe along the rail — uncountable, which is the whole thing
    // it exists to do, and it looks like a bug rather than a battery. Eight readable cannons beat thirteen
    // smeared into a bar, and the HUD states the real number anyway. A hand-placed battery is exempt: whoever
    // placed it looked at the hull and knows what fits.
    const drawn = Math.min(8, n);
    const span = Math.min(0.68, 0.3 + drawn * 0.055);
    const out = [];
    for (let i = 0; i < drawn; i += 1) {
        // A LONE gun does not sit dead amidships. The crew sprite stands at exactly 0.5 and a single centred
        // cannon lands behind it — drawing order now keeps it visible, but a barrel bisecting the captain still
        // reads as a mistake. Nudged just off centre, which looks deliberate whichever way the hull faces.
        const t = drawn === 1 ? 0.62 : i / (drawn - 1);
        out.push({ x: 0.5 - span / 2 + t * span, y });
    }
    return out;
}

/**
 * The ports to draw for one ship.
 *
 * `art` is the fleet art id (or `boat:<tier>`), `deckPct` its deck line, `n` how many guns it actually has.
 * Returns at most `n` — a twelve-gun man-o'-war with five placed ports draws five rather than inventing seven.
 */
export function gunPortsFor(art, deckPct, n) {
    const count = Math.max(0, Math.min(24, Math.floor(n) || 0));
    if (!count) return [];
    const placed = GUN_PORTS[art];
    if (placed?.length) return placed.slice(0, count);
    return fallbackPorts(deckPct, count);
}

/** Convenience for the two callers that only have the ship, not its deck line. */
export const fleetGunPorts = (art, n) => gunPortsFor(art, fleetDeck(art), n);
export const boatGunPorts = (tier, n) => gunPortsFor(`boat:${tier}`, boatDeck(tier), n);
