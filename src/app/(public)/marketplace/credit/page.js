import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import StoreCreditClient from "@/components/StoreCreditClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    COINS_PER_CENT,
    ONLINE_FEE_RATE,
    MIN_CREDIT_CENTS,
    MAX_CREDIT_CENTS,
    getStoreCredit,
    listStoreCreditEvents,
} from "@/lib/marketplace/store-credit.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { creditPurchaseBonus } from "@/lib/marketplace/signatures.js";
import { visiblePackages } from "@/lib/marketplace/packages-server.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Store Credit | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function StoreCreditPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    // Not signed in → show the marketplace login/register surface (same as the profile hub).
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>💳 Store Credit</h1>
                    <p className="muted">Sign in to add store credit and earn coins.</p>
                    <MarketplaceProfileClient />
                </section>
            </div>
        );
    }

    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    const [balanceCents, events, equipped] = await Promise.all([
        getStoreCredit(buyer.id).catch(() => 0),
        listStoreCreditEvents(buyer.id, 20).catch(() => []),
        getEquippedIds(buyer.id).catch(() => ({})),
    ]);
    const coinBonus = creditPurchaseBonus(equipped); // bonus fraction from equipped credit gear
    // One gate, in one place — see packages-server.js. `withArt` because this screen draws the item.
    const offers = await visiblePackages(buyer.id, { withArt: true });

    return (
        <div className="stack reveal">
            <StoreCreditClient
                paymentsEnabled={paymentsEnabled}
                squareApplicationId={process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || ""}
                squareLocationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || ""}
                initialBalanceCents={balanceCents}
                initialEvents={events}
                coinsPerCent={COINS_PER_CENT}
                feeRate={ONLINE_FEE_RATE}
                minCents={MIN_CREDIT_CENTS}
                maxCents={MAX_CREDIT_CENTS}
                coinBonus={coinBonus}
                offers={offers}
            />
        </div>
    );
}
