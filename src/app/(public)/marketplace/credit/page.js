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
import { PACKAGES, packageSettingKey } from "@/lib/marketplace/packages.js";
import { getSetting } from "@/lib/settings.js";
import { isOwner } from "@/lib/marketplace/owner.js";

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
    // ── WHICH PACKAGES THIS MEMBER MAY ACTUALLY SEE ──────────────────────────────────────────────────────
    // Resolved on the SERVER and never shipped as "here is the catalog, hide some of it": an unreleased
    // package must not reach the browser at all, or its name and contents are one devtools tab away. The
    // checkout enforces the same rule again — this decides what is drawn, that decides what can be bought.
    const offers = [];
    for (const p of PACKAGES) {
        const open = String(await getSetting(packageSettingKey(p.id), "off").catch(() => "off")) === "on";
        if (open || isOwner(buyer.id)) offers.push({ ...p, ownerPreview: !open });
    }

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
