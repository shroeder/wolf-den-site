import AuctionClient from "@/components/AuctionClient";
import { gatePage } from "@/lib/marketplace/gate-page.js";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuctionState } from "@/lib/marketplace/auction.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Auction House | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function AuctionPage() {
    // The town gate's route half — see gate-page.js. One line, and it is the half that gets forgotten.
    await gatePage("auction");
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>🏛️ Auction House</h1>
                    <p className="muted">Sign in to browse the Auction House.</p>
                    <MarketplaceProfileClient />
                </section>
            </div>
        );
    }
    const initial = await getAuctionState(buyer.id).catch(() => ({ owner: true, listings: [], sellable: [], mine: [], gold: 0, feePct: 0.05, durations: [1, 3, 5, 7] }));
    return <AuctionClient initial={initial} />;
}
