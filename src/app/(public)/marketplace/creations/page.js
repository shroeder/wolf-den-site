import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import ViewPing from "@/components/ViewPing";
import CreationTokensClient from "@/components/CreationTokensClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasOwnerStanding } from "@/lib/marketplace/owner.js";
import { CREATION_TOKEN_TIERS } from "@/lib/marketplace/creation-tokens.js";
import { getTokenBalance } from "@/lib/marketplace/creation-tokens-server.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Creations | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function CreationTokensPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    // Not signed in → show the marketplace login/register surface (same pattern as the store-credit page).
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>🎨 Creations</h1>
                    <p className="muted">Sign in to buy creations and design your own AI art — yours forever.</p>
                    <MarketplaceProfileClient />
                </section>
            </div>
        );
    }

    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    const tokenBalance = await getTokenBalance(buyer.id).catch(() => 0);
    // The dollar balance already on the account — a second way to pay, and the only one that works when card
    // payments are dark. See the note on `pay: "credit"` in the checkout route for why it grants no coins.
    const creditCents = await getStoreCredit(buyer.id).catch(() => 0);
    // The badge, not the one-account allow-list — the same question custom-deco's `free` asks.
    const owns = await hasOwnerStanding(buyer.id).catch(() => false);

    return (
        <div className="stack reveal">
            <ViewPing event="view_creations" />
            <CreationTokensClient
                paymentsEnabled={paymentsEnabled}
                squareApplicationId={process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || ""}
                squareLocationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || ""}
                tiers={CREATION_TOKEN_TIERS}
                initialTokenBalance={tokenBalance}
                initialCreditCents={creditCents}
                isOwner={owns}
            />
        </div>
    );
}
