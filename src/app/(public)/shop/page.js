import Link from "next/link";
import { cookies } from "next/headers";

import DiscoverClient from "@/components/shop/DiscoverClient";
import ShopViewToggle from "@/components/shop/ShopViewToggle";
import { SHOP_VIEW, SHOP_VIEW_COOKIE, parseShopView } from "@/lib/shop-view.js";

import RewardsCallout from "@/components/RewardsCallout";
import ShopBrowser from "@/components/ShopBrowser";
import StoreCreditCallout from "@/components/StoreCreditCallout";
import ViewPing from "@/components/ViewPing";
import { listShopInventoryShared } from "@/lib/consignment/square";
import { TTL } from "@/lib/marketplace/shared-cache.js";
import { listPreorderShopItems, listRecentChanges } from "@/lib/inventory-feed/feed";
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
    // -- THE VIEW IS DECIDED BEFORE ANYTHING IS FETCHED, AND THAT IS THE POINT ---------------------------
    // Measured on production 2026-11-01: /shop ships 863 KB of HTML holding all 1,798 in-stock items --
    // every name, price and image URL -- because ShopBrowser is a client component that switches category
    // without a round trip. Only 66 <img> actually render. TTFB is fine (0.21 s; the shared catalogue cache
    // did its job and the 7-second Square problem described below is gone). The stall is the browser
    // parsing that payload and then HYDRATING a React tree of 1,798 items, and it lands hardest on a phone.
    //
    // The deck needs none of it -- DiscoverClient pages its own rows off /api/marketplace/discover, 24 at a
    // time. So the default path must not even CALL listShopInventoryShared. Returning before the fetch is
    // worth more than any amount of tuning inside the grid.
    const view = parseShopView((await cookies()).get(SHOP_VIEW_COOKIE)?.value);
    if (view === SHOP_VIEW.swipe) {
        return (
            <div className="stack reveal">
                <ViewPing event="view_shop" />
                <ShopViewToggle view={view} />
                <DiscoverClient />
            </div>
        );
    }

    let [categories, justInItems, preorders] = await Promise.all([
        listShopInventoryShared(SHOP_CATALOGUE_TTL).catch(() => null),
        listRecentChanges({ windowHours: JUST_IN_WINDOW_HOURS }).catch(() => []),
        listPreorderShopItems().catch(() => []),
    ]);
    if (categories) {
        categories = await attachSetNames(categories).catch(() => categories);
    }
    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    // -- PRE-ORDERS ARE NOT A CATEGORY AND MUST NOT BECOME ONE ------------------------------------------
    // Luke: "I want them to be in the right square category under Pokemon Sealed and Magic Sealed. But I
    // wonder if there's a way to also flag them with a custom attribute as pre-order."
    //
    // The flag already exists: shop_item_rules.preorder_arrives_on, written by the Restocking screen. That
    // one column drives every place a pre-order shows its face -- the "[Pre-Order] " prefix on the Square
    // name, the wording at checkout, the confirmation email, the arrival email, and these two props.
    // Mirroring it into a Square custom attribute would be two sources for one fact, and there would be a
    // day somebody set one and not the other.
    //
    // So the item keeps its real Square category and the shelf is assembled HERE, off the list that was
    // already fetched for the door above. No extra round trip.
    const preorderDates = Object.fromEntries(
        preorders.map((item) => [item.variationId, item.arrivesOn || null]),
    );

    // ── ⚠️ THE DOOR TO DISCOVER, AND WHY THERE IS NO LONGER A LINK HERE ─────────────────────────────────
    // Built the deck, shipped it, and linked it from nowhere — Luke: "Where is the experimental at I don't
    // see the try the new view." That is the SECOND time in one day a finished screen had no way in (the
    // pack telemetry was the first). A feature reachable only by typing its URL does not exist.
    //
    // ⚠️ IT IS A try/catch AROUND AN AUTH READ ON A PUBLIC, CACHED PAGE. /shop renders for signed-out
    // visitors and for crawlers; a session lookup that throws must degrade to "no toggle", never to a 500
    // on the storefront. Worth more than the toggle it controls.
    // The invitation that used to sit here is gone: the deck is the DEFAULT now, so what this page needs
    // is a way BACK to the grid, and that is ShopViewToggle below — the same control in both views. The
    // auth read went with it; nothing on this path is per-member any more.
    const hasContent = (categories && categories.length > 0) || (justInItems && justInItems.length > 0);

    return (
        <div className="stack reveal">
            <ViewPing event="view_shop" />
            {/* The same control, in the same place, in both views. The prose link above is dead -- the
                thing it advertised is what you get by default now, and Luke could not find it on his own
                phone anyway, which is the lesson recorded directly above it. */}
            <ShopViewToggle view={view} />
            {paymentsEnabled ? <><RewardsCallout /><StoreCreditCallout /></> : null}
            {/* ── THE DOOR TO THE PRE-ORDER SHELF ─────────────────────────────────────────────────────
                ⚠️ ONLY WHILE THERE IS SOMETHING ON IT. A permanent link to an empty room is a link people
                learn to stop tapping, and this shop will spend most of its year with nothing on pre-order.
                The page itself still answers for anybody arriving from a bookmark or a shared link.

                Above the browser rather than inside it: a pre-order is the one thing here you buy on a
                promise instead of on availability, which is a different decision from the one the category
                list is for. The Discover note above is the lesson -- a finished screen reachable only by
                typing its URL does not exist. */}
            {preorders.length > 0 ? (
                <Link href="/shop/preorders" className="shop-preorder-door">
                    <strong>
                        {preorders.length === 1 ? "1 pre-order open" : `${preorders.length} pre-orders open`}
                    </strong>
                    <span>Reserve an upcoming release &mdash; pay now, we tell you the day it lands</span>
                </Link>
            ) : null}
            {hasContent ? (
                <section className="card">
                    <ShopBrowser
                        justInItems={justInItems || []}
                        categories={categories || []}
                        paymentsEnabled={paymentsEnabled}
                        preorders={preorders}
                        /* A plain object, not a Set. This crosses the server/client boundary, and a Set
                           arrives at the client as {} -- which would fail SILENTLY: every ribbon would
                           simply not render and the grid would still look fine. */
                        preorderDates={preorderDates}
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
