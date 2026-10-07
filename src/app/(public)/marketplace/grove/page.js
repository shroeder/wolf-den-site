import { redirect } from "next/navigation";

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
export default async function GrovePage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer?.id) redirect("/marketplace");
    if (!groveOpen(buyer.id)) redirect("/marketplace");

    const initial = await groveState(buyer.id);
    return (
        <main className="mkt-wrap" style={{ paddingTop: 12 }}>
            <GroveClient initial={initial} />
        </main>
    );
}
