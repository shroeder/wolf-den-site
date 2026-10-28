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
export const DISCOVER_PUBLIC = false;

/** Can this member open Discover? */
export function discoverOpenFor(buyerId) {
    if (DISCOVER_PUBLIC) return true;
    return isOwner(buyerId);
}
