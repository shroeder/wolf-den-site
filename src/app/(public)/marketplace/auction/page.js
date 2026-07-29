import AuctionClient from "@/components/AuctionClient";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getAuctionState } from "@/lib/marketplace/auction.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Auction House | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function AuctionPage() {
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
    if (!isOwner(buyer.id)) {
        return (
            <div className="stack reveal">
                <section className="card"><h1 style={{ marginTop: 0 }}>🏛️ Auction House</h1><p className="muted" style={{ margin: 0 }}>The Auction House is still being built — check back soon.</p></section>
            </div>
        );
    }
    const initial = await getAuctionState(buyer.id).catch(() => ({ owner: true, listings: [], sellable: [], mine: [], gold: 0, feePct: 0.05, durations: [1, 3, 5, 7] }));
    return <AuctionClient initial={initial} />;
}
