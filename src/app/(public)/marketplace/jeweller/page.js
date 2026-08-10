import { notFound } from "next/navigation";

import JewellerClient from "@/components/JewellerClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getJewellerState } from "@/lib/marketplace/jeweller.js";

// UNDER CONSTRUCTION — owner only, and a 404 for everyone else rather than a locked door, because a door
// tells you the feature exists. Jewel DROPS are gated by the same predicate, so nobody outside the allow-list
// is quietly accumulating gems for a bench they cannot open.
export const dynamic = "force-dynamic";
export const metadata = { title: "The Jewelcutter | The Wolf Den", robots: { index: false } };

export default async function JewellerPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound();
    const state = await getJewellerState(buyer.id);
    return <JewellerClient initial={state} />;
}
