import { redirect } from "next/navigation";

import DiscoverClient from "@/components/shop/DiscoverClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discoverOpenFor } from "@/lib/marketplace/discover-gate.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Discover | The Wolf Den",
    // ⚠️ NOT INDEXED WHILE IT IS EXPERIMENTAL. The ordinary /shop is the linkable, indexed one and stays
    // that way — this view has no stable URL per item and would be a bad search result for every card.
    robots: { index: false, follow: false },
};

// Stage one: owner only (discover-gate.js). The door is not the gate — the API checks for itself.
export default async function DiscoverPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !discoverOpenFor(buyer.id)) redirect("/shop");
    return <DiscoverClient />;
}
