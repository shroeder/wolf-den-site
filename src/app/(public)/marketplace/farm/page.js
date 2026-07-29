import { notFound } from "next/navigation";

import FarmClient from "@/components/FarmClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFarm, resolveFarmOwner } from "@/lib/marketplace/farm.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Farm | The Wolf Den", robots: { index: false } };

// Every signed-in member has a farm. ?u=<alias> inspects another member's farm (view-only).
export default async function FarmPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound();

    const sp = (await searchParams) || {};
    const u = typeof sp.u === "string" ? sp.u : null;
    let ownerId = buyer.id;
    if (u) {
        const o = await resolveFarmOwner(u);
        if (o) ownerId = o.id;
    }
    const farm = await getFarm(ownerId, buyer.id);
    if (!farm) notFound();
    // Owner-debug flag (powers the "Test critter" button) — the GET route sets this, but the initial page render
    // must too, since the client doesn't re-fetch the full farm on mount.
    farm.ownerDebug = !u && isOwner(buyer.id);

    return <FarmClient initial={farm} viewingAlias={farm.mine ? null : u} />;
}
