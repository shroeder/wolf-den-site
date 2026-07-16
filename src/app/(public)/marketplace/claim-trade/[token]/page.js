import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import TradeClaimClient from "@/components/TradeClaimClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getTradeClaim } from "@/lib/marketplace/trade-claim.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Claim your trade rewards | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function TradeClaimPage({ params }) {
    const { token } = await params;
    const buyer = await getAuthenticatedBuyer();

    // Sign in first, then land right back here so the rewards bank without re-scanning.
    if (!buyer) return <MarketplaceLoginClient redirectTo={`/marketplace/claim-trade/${token}`} />;

    const claim = await getTradeClaim(token);

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card">
                <TradeClaimClient token={token} claim={claim} />
            </section>
        </div>
    );
}
