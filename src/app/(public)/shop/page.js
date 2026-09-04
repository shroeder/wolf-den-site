import Link from "next/link";

import RewardsCallout from "@/components/RewardsCallout";
import ShopBrowser from "@/components/ShopBrowser";
import StoreCreditCallout from "@/components/StoreCreditCallout";
import ViewPing from "@/components/ViewPing";
import { listShopInventory } from "@/lib/consignment/square";
import { shared, TTL } from "@/lib/marketplace/shared-cache.js";
import { listRecentChanges } from "@/lib/inventory-feed/feed";
import { attachSetNames } from "@/lib/shop-set-tags";

export const metadata = {
    title: "Pokemon, MTG & Accessories",
    description:
        "Shop Pokemon cards, Magic: The Gathering, sealed product, singles, and accessories at The Wolf Den in Montgomery, MN, serving players across southern Minnesota.",
    alternates: {
        canonical: "/shop",
    },
};

// Render against the live inventory + arrivals feed, not a build-time snapshot.
export const dynamic = "force-dynamic";

// ── THE STOREFRONT WAS MAKING 24 SQUARE API CALLS PER VIEW ───────────────────────────────────────────────────
// Measured: /shop took 7.1 SECONDS, repeatably, warm. It is not the database — the feed query behind it
// returns 1,552 rows in 326 ms. It is listShopInventory(), which paginates Square's catalogue with a
// cursor loop (categories, then items), then fetches inventory counts and image URLs. Twenty-four sequential
// HTTPS calls at ~280 ms each is the seven seconds, near enough exactly.
//
// The page still renders per request — force-dynamic stays, arrivals and callouts are live. What is cached is
// the CATALOGUE, which is refreshed by a cron every half hour anyway, so a five-minute window is strictly
// fresher than the data the "Just in" strip beside it is drawn from.
//
// Per-instance, like every other use of shared(): the win is that one lambda serving a crawler sweep makes 24
// calls instead of 24 per page.
const SHOP_CATALOGUE_TTL = TTL.ART;

const JUST_IN_WINDOW_HOURS = 24 * 7;

export default async function ShopPage() {
    let [categories, justInItems] = await Promise.all([
        shared("shop:catalogue", SHOP_CATALOGUE_TTL, () => listShopInventory()).catch(() => null),
        listRecentChanges({ windowHours: JUST_IN_WINDOW_HOURS }).catch(() => []),
    ]);
    if (categories) {
        categories = await attachSetNames(categories).catch(() => categories);
    }
    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    const hasContent = (categories && categories.length > 0) || (justInItems && justInItems.length > 0);

    return (
        <div className="stack reveal">
            <ViewPing event="view_shop" />
            {paymentsEnabled ? <><RewardsCallout /><StoreCreditCallout /></> : null}
            {hasContent ? (
                <section className="card">
                    <ShopBrowser
                        justInItems={justInItems || []}
                        categories={categories || []}
                        paymentsEnabled={paymentsEnabled}
                    />
                </section>
            ) : (
                <section className="grid two-col">
                    <article className="card lift">
                        <h2>Sealed Product</h2>
                        <p>Current Pokemon and Magic releases, ETBs, booster boxes, bundles, commander decks, and other sealed product will be a major focus.</p>
                    </article>
                    <article className="card lift">
                        <h2>Singles</h2>
                        <p>We are growing a local singles selection for collectors and players who want a nearby option instead of a long drive to larger markets.</p>
                    </article>
                    <article className="card lift">
                        <h2>Accessories</h2>
                        <p>Sleeves, deck boxes, binders, playmats, and other supplies are part of the core in-store lineup for new and returning players.</p>
                    </article>
                    <article className="card lift">
                        <h2>Trade-Ins and Buylist Opportunities</h2>
                        <p>Local trade-ins help expand inventory and keep the shop connected to the community. Cash and store credit offers are available on qualifying cards and collections.</p>
                    </article>
                </section>
            )}

            <section className="card shop-secondary">
                <h2>Serving Southern Minnesota Shoppers</h2>
                <p>
                    The Wolf Den serves Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and nearby southern Minnesota communities looking for a real local game store with real shelf inventory.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/sell-cards">
                        Sell or Trade Cards
                    </Link>
                    <a className="button" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord for Inventory Updates
                    </a>
                </div>
            </section>
        </div>
    );
}
