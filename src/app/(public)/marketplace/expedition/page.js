import { notFound } from "next/navigation";

import ExpeditionClient from "@/components/ExpeditionClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { expeditionsOpenTo } from "@/lib/marketplace/expedition.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "A charted island | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

// ⚠️ THE FIRST HALF OF THE PAIR — notFound(), not a message. A page that renders "you cannot see this" tells
// everybody the feature exists and invites them to guess the API. The other half is the gate in
// /api/marketplace/sailing/expedition, and both read the same CAPTAINS_PUBLIC that gates the capture and the
// helm's charted option. See [[feature-gates-come-in-pairs]] and [[sailing-test-overrides]].
export default async function ExpeditionPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient />;
    if (!expeditionsOpenTo(buyer.id)) notFound();
    return (
        <main className="wrap" style={{ paddingTop: 14, paddingBottom: 28 }}>
            <ExpeditionClient />
        </main>
    );
}
