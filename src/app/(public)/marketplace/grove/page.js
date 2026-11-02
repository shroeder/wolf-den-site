import { redirect } from "next/navigation";
import { gatePage } from "@/lib/marketplace/gate-page.js";

import GroveClient from "@/components/grove/GroveClient.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { groveState, groveOpen } from "@/lib/marketplace/grove.js";

export const dynamic = "force-dynamic";

// ── THE GROVE ────────────────────────────────────────────────────────────────────────────────────────────────
// Map one of the node map. See docs/node-map-design.md.
//
// ⚠️ OWNER-GATED, AND THE DOOR IS CHECKED HERE AS WELL AS IN EVERY VERB. Luke: "We will start by owner gating
// all of this." A page that renders for everyone while the API refuses them is the ownerOnly landmine —
// unobtainable one way and leaky the other. This sends anybody else back to the marketplace rather than
// showing them a screen full of locked nodes they cannot ever open.
// ?view=town&town=N — written by the return door, read here. See grove-return.js for why the note is kept by
// the Grove rather than attached to each way out of it.
//
// ⚠️ NOT VALIDATED HERE, DELIBERATELY. GroveClient accepts `town` only as a town number and `view` only as
// the literal "town", so a typed or tampered value lands on the map; and the town street behind it is still
// gated by isOwner inside getTownState, which is the check that actually matters. A second, looser copy of
// that rule in the page would be the one that drifts.
export default async function GrovePage({ searchParams }) {
    // The town gate's route half — see gate-page.js. One line, and it is the half that gets forgotten.
    await gatePage("grove");
    const buyer = await getAuthenticatedBuyer();
    if (!buyer?.id) redirect("/marketplace");
    if (!groveOpen(buyer.id)) redirect("/marketplace");

    const initial = await groveState(buyer.id);
    const sp = await searchParams;
    return (
        <main className="mkt-wrap" style={{ paddingTop: 12 }}>
            <GroveClient initial={initial} initialView={sp?.view || null} initialTown={sp?.town || null} />
        </main>
    );
}
