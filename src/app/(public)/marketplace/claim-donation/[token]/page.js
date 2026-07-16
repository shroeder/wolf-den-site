import DonationClaimClient from "@/components/DonationClaimClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getDonationClaim } from "@/lib/marketplace/donation-claim.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Claim your donation rewards | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function DonationClaimPage({ params }) {
    const { token } = await params;
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient redirectTo={`/marketplace/claim-donation/${token}`} />;

    const claim = await getDonationClaim(token);

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card">
                <DonationClaimClient token={token} claim={claim} />
            </section>
        </div>
    );
}
