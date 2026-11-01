import { isOwner } from "@/lib/marketplace/owner.js";

// ── WHO CAN SEE DISCOVER ─────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md §7. Luke, 2026-10-27: "Maybe its an experimental view that isnt the default.
// That way we can try it out first."
//
// ⚠️ ONE SWITCH, IMPORTED EVERYWHERE — never re-derived as isOwner() at a call site. That is the rule
// vault-gate.js records the hard way: a second copy of the condition keeps a feature shut for everyone on
// the day it is meant to open, because somebody flipped the constant and missed the copy.
//
// The rollout is three stages and this is stage one:
//   1. owner only, to look at it on a real phone against real stock      <- HERE
//   2. a toggle on the normal shop anybody can turn on and off
//   3. decide whether it ever becomes the default, with usage to argue from
//
// ⚠️ AND IT NEVER REPLACES THE EXISTING SHOP AT ANY STAGE. That one works on desktop, is linkable, is
// indexed, and is how somebody finds a SPECIFIC card. Discover is for the other mood entirely.
// ── ⚠️ STAGE 3: THIS IS THE DEFAULT NOW ────────────────────────────────────────────────────────────────────
// Luke, 2026-11-01: "Can we make the new shop experience the default, and have a way to change the view mode
// to the old one that is intuitive."
//
// The note above says Discover must NEVER replace the existing shop, on the grounds that the grid works on
// desktop, is linkable, is indexed and is how somebody finds a SPECIFIC card. All of that is still true,
// which is why this is a DEFAULT and not a deletion: /shop renders either view off a cookie, the toggle sits
// at the top of both, every product keeps its own indexed URL, and the grid is one tap away forever.
//
// ⚠️ AND IT IS NO LONGER A MEMBER FEATURE. A storefront that needs a login is not a storefront, so the gate
// answers for a signed-out visitor too and the route sends creditCents 0 instead of a 403.
export const DISCOVER_PUBLIC = true;

/** Can this member open Discover? */
export function discoverOpenFor(buyerId) {
    if (DISCOVER_PUBLIC) return true;
    return isOwner(buyerId);
}
