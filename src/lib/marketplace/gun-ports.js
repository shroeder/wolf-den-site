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
    // The battery widens with the number of guns. At a fixed span, a thirteen-gun ship packed every barrel into
    // the same stretch of deck and they overlapped into one solid dark log — you could not count them, which is
    // the entire point of drawing them.
    const span = Math.min(0.68, 0.3 + n * 0.045);
    const out = [];
    for (let i = 0; i < n; i += 1) {
        const t = n === 1 ? 0.5 : i / (n - 1);
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
