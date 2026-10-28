import "server-only";

import { redirect } from "next/navigation";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { requireFeature } from "@/lib/marketplace/town-gate.js";
import { FEATURE_TOWN, NEVER_GATED } from "@/lib/marketplace/towns.js";

// ── THE ROUTE HALF OF THE GATE ───────────────────────────────────────────────────────────────────────────────
// ⚠️ FEATURE GATES COME IN PAIRS AND THIS IS THE HALF THAT GETS FORGOTTEN. A dimmed tile whose URL still serves
// the page is not locked — it is a locked door with the window left open, and this codebase has shipped that
// before. GameNav renders the tile as a plain <div> so there is nothing to click, but a typed URL, a
// bookmark, a shared link or a stale tab all reach the page directly.
//
// One line at the top of every gated page:
//
//     await gatePage("arena");
//
// ⚠️ AND IT COSTS NOTHING FOR ALMOST EVERYONE. `gated_at` is NULL for every account that existed when gating
// shipped, so requireFeature answers true after a single LEFT JOIN that the page was going to pay for anyway
// when it read the session. A member from before the Grove never notices this exists.
//
// scripts/check-gates.mjs asserts that every feature named in towns.js has a page that calls this, so the
// pair cannot come apart silently the way the last one did.

/**
 * Bounce a member who has not unlocked this feature yet.
 *
 * Sends them to the game hub rather than showing a wall: the hub is where the next thing to do is, and a
 * member who followed a stale link wants somewhere to go, not an explanation.
 */
export async function gatePage(feature) {
    // ⚠️ THE FREE ANSWER FIRST, BEFORE ANY READ. Town 1's features are open to every account that exists —
    // there is no state under which they are shut — and NEVER_GATED is open by policy. Asking the database
    // whether the Grove is unlocked on the Grove's own page is a round trip to learn a constant, and this
    // runs on page views, which is the meter that bills.
    if (NEVER_GATED.has(feature) || (FEATURE_TOWN[feature] || 0) <= 1) return;
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    // Not signed in is not this gate's business — the page's own auth handles it, and bouncing here would
    // turn every locked feature into a redirect loop for logged-out visitors.
    if (!buyer?.id) return;
    const open = await requireFeature(buyer.id, feature).catch(() => true);
    if (!open) redirect("/marketplace/play?locked=" + encodeURIComponent(feature));
}
