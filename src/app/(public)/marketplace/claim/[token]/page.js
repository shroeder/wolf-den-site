import LoyaltyClaimClient from "@/components/LoyaltyClaimClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Claim your points | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function LoyaltyClaimPage({ params }) {
    const { token } = await params;
    const buyer = await getAuthenticatedBuyer();

    // Scanning a receipt QR is usually a NEW customer — drop them straight on the create-account form (they
    // can switch to "sign in" if they already have one), then land right back here so the points bank.
    if (!buyer) return <MarketplaceLoginClient redirectTo={`/marketplace/claim/${token}`} signup />;

    const claim = await getLoyaltyClaim(token);

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card">
                <LoyaltyClaimClient token={token} claim={claim} />
            </section>
        </div>
    );
}
