import { notFound } from "next/navigation";

import ForestClient from "@/components/ForestClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { forestOpenTo } from "@/lib/marketplace/forest.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "The Forest | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

// ⚠️ THE FIRST HALF OF THE PAIR — notFound(), not a message. A page that renders "you cannot see this" tells
// everybody the feature exists and invites them to guess the API. The route simply is not there yet.
// The other half is the gate in /api/marketplace/forest. See FOREST_PUBLIC.
export default async function ForestPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient />;
    if (!forestOpenTo(isOwner(buyer.id))) notFound();
    return (
        <main className="wrap" style={{ paddingTop: 14, paddingBottom: 28 }}>
            <ForestClient />
        </main>
    );
}
