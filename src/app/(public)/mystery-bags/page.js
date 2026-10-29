import MysteryBagShowcaseClient from "@/components/MysteryBagShowcaseClient";
import PackOpenClient from "@/components/packs/PackOpenClient";
import { cookies } from "next/headers";

import { getMysteryBagDashboardData } from "@/lib/mystery-bags";
import { getMarketingQrCodes } from "@/lib/marketing-qr";
import { devFixture } from "@/lib/dev-fixture.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { packPoolSummary, resumePendingOpen } from "@/lib/marketplace/packs.js";
import { cheapestOpenPackCents } from "@/lib/marketplace/pack-pools.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { VAULT_PUBLIC, vaultOpenFor } from "@/lib/marketplace/vault-gate.js";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const DEFAULT_BAG_PRICE = 25;

function resolveBagPrice(squareBagPrice, metrics) {
    const squarePrice = Number(squareBagPrice || 0);

    if (squarePrice > 0) {
        return {
            value: squarePrice,
            source: "square",
        };
    }

    const explicitPrice = Number(process.env.MYSTERY_BAG_PRICE || process.env.NEXT_PUBLIC_MYSTERY_BAG_PRICE || 0);

    if (explicitPrice > 0) {
        return {
            value: explicitPrice,
            source: "env_fallback",
        };
    }

    const averageBasedPrice = Number(metrics?.marketAverage || 0);

    if (averageBasedPrice > 0) {
        return {
            value: averageBasedPrice,
            source: "average_fallback",
        };
    }

    return {
        value: DEFAULT_BAG_PRICE,
        source: "default_fallback",
    };
}

export const metadata = {
    title: "Mystery Bag Live Chase Board",
    description:
        "Watch live chase hits, biggest remaining cards, and real-time mystery bag value at The Wolf Den.",
    alternates: {
        canonical: "/mystery-bags",
    },
};

export const dynamic = "force-dynamic";

export default async function MysteryBagsPage() {
    const [data, qrCodes] = await Promise.all([
        getMysteryBagDashboardData().catch(() => null),
        getMarketingQrCodes().catch(() => []),
    ]);
    const cards = data?.cards || [];
    const squareBagPrice = data?.bagPrice || 0;
    const metrics = data?.metrics || {
        itemCount: 0,
        marketTotal: 0,
        marketAverage: 0,
    };
    const bagPriceResolution = resolveBagPrice(squareBagPrice, metrics);
    const bagPrice = bagPriceResolution.value;
    const remainingPacks = data?.remainingPacks ?? null;
    const marketTotal = metrics.marketTotal || 0;

    // ── DOOR 1 OF 9 (docs/virtual-packs-and-the-card-vault.md §16.2) ─────────────────────────────────────────
    // ⚠️ ONLY THE OPEN-ONLINE SURFACE IS GATED. The board below has listed this pool card by card for months
    // and is not part of this feature — hiding it would be a regression in something unrelated. A visitor who
    // cannot open a pack sees exactly the page they saw yesterday.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const canSeeOpening = Boolean(buyer && vaultOpenFor(buyer.id));

    let openingProps = null;
    if (canSeeOpening) {
        const [pool, balanceCents, pending, fromCents] = await Promise.all([
            packPoolSummary().catch(() => null),
            getStoreCredit(buyer.id).catch(() => 0),
            resumePendingOpen(buyer.id).catch(() => null),
            // One MIN() against a nine-row table, on a request already reading three things. See
            // cheapestOpenPackCents for why the entry button cannot use pool.priceCents.
            cheapestOpenPackCents().catch(() => null),
        ]);
        if (pool) openingProps = { pool, balanceCents, pending, fromCents };

        // ── ⚠️ THE REVEAL CANNOT BE PHOTOGRAPHED WITHOUT SPENDING A PACK, AND THAT IS WHY THIS IS HERE ──
        // Everything this screen draws is a server-rendered prop, so --mock cannot reach it: filming the
        // sell-or-keep moment meant opening a real $20 bag out of real stock on a real account, every single
        // time. The states that cost money are exactly the states that go unlooked-at — the first film of
        // this feature put the value and both buttons below the fold, and it took a live pull to find out.
        //
        // devFixture is a hard no-op in production (its first line), so a forged cookie does nothing live.
        //
        //   document.cookie = "wolfden-fixture=mythic"   → scripts/fixtures/.live/packs.mythic.json
        const fixture = devFixture("packs", (await cookies()).get("wolfden-fixture")?.value);
        if (fixture) openingProps = { ...openingProps, ...fixture };
    }

    return (
        <>
            {/* ⚠️ OUTSIDE .mb-page ON PURPOSE. That class is the Live Chase Board's own panel and it carries two
                warm radial gradients — which washed the whole pack opening in a yellow-brown tint and killed
                the contrast the gold is supposed to have. The opening gets its own neutral panel instead;
                the board keeps the look it always had. */}
            {openingProps ? <PackOpenClient initial={openingProps} /> : null}

        <div className="mb-page">

            {/* The register CTA appears only once the feature is actually open to register FOR. While it is
                owner-gated, advertising it to the Den would be selling a door that is locked. */}
            {VAULT_PUBLIC && !buyer ? (
                <section className="card" style={{ textAlign: "center" }}>
                    <h2 style={{ marginTop: 0 }}>Open a pack from here</h2>
                    <p className="muted">
                        Members can open mystery packs online, sell the card straight back for store credit, or
                        keep it in their vault.
                    </p>
                    <a className="pk-btn pk-btn-primary" href="/marketplace/login">Create an account</a>
                </section>
            ) : null}

            <MysteryBagShowcaseClient
                cards={cards}
                bagPrice={bagPrice}
                remainingPacks={remainingPacks}
                marketTotal={marketTotal}
                qrCodes={qrCodes}
            />
        </div>
        </>
    );
}
