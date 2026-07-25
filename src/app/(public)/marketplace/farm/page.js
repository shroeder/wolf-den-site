import { notFound } from "next/navigation";

import FarmClient from "@/components/FarmClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFarm, resolveFarmOwner } from "@/lib/marketplace/farm.js";

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

    return <FarmClient initial={farm} viewingAlias={farm.mine ? null : u} />;
}
