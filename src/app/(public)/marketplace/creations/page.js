import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import CreationTokensClient from "@/components/CreationTokensClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { CREATION_TOKEN_TIERS } from "@/lib/marketplace/creation-tokens.js";
import { getTokenBalance } from "@/lib/marketplace/creation-tokens-server.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Creation Tokens | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function CreationTokensPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    // Not signed in → show the marketplace login/register surface (same pattern as the store-credit page).
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>🎨 Creation Tokens</h1>
                    <p className="muted">Sign in to buy creation tokens and design your own AI farm decorations.</p>
                    <MarketplaceProfileClient />
                </section>
            </div>
        );
    }

    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    const tokenBalance = await getTokenBalance(buyer.id).catch(() => 0);

    return (
        <div className="stack reveal">
            <CreationTokensClient
                paymentsEnabled={paymentsEnabled}
                squareApplicationId={process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || ""}
                squareLocationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || ""}
                tiers={CREATION_TOKEN_TIERS}
                initialTokenBalance={tokenBalance}
                isOwner={isOwner(buyer.id)}
            />
        </div>
    );
}
