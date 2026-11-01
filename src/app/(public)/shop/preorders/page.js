import Link from "next/link";

import ViewPing from "@/components/ViewPing";
import { listPreorderShopItems } from "@/lib/inventory-feed/feed.js";
import { productHandle } from "@/lib/inventory-feed/product-url.js";
import { preorderDateLabel } from "@/lib/shop-item-rules.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Pre-orders | The Wolf Den",
    description:
        "Upcoming releases you can reserve now at The Wolf Den in Montgomery, MN. Pay today, and we ship or hold it the day it lands.",
};

// ── THE PRE-ORDER SHELF ──────────────────────────────────────────────────────────────────────────────────
// Luke: "Can we make a preorders section of the shop".
//
// ⚠️ IT IS A SHELF, NOT A FILTER ON THE MAIN ONE. A pre-order is the one thing in the shop you buy on a
// promise rather than on availability, and the whole page can therefore say once, at the top, what every
// card on it means — instead of each card having to re-explain itself the way it does when it is sitting
// between things that are actually in the building.
//
// ⚠️ AND THE DATE IS ON EVERY CARD. The product page carries the full sentence; a card has room for the
// one fact that decides whether somebody taps it, which is when they would get the thing.
export default async function PreordersPage() {
    const items = await listPreorderShopItems().catch(() => []);

    return (
        <div className="stack reveal">
            <ViewPing event="view_preorders" />

            <section className="card">
                <h1 style={{ marginTop: 0 }}>Pre-orders</h1>
                <p className="muted" style={{ marginBottom: 0 }}>
                    Upcoming releases you can reserve now. You pay today and the price is locked in; nothing
                    ships or goes on the pickup shelf until it reaches the shop, and we email you the moment it
                    does. Anything else you order alongside a pre-order travels with it.
                </p>
            </section>

            {items.length === 0 ? (
                /* ⚠️ AN EMPTY SHELF SAYS SO AND POINTS SOMEWHERE. This page is linked from the shop only
                   while something is on it, so a visitor seeing this arrived from a bookmark, a search
                   result or a link somebody shared after the release landed. */
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>Nothing on pre-order right now</h2>
                    <p className="muted">
                        Everything we have is in the building and ready to go. New releases turn up here as soon
                        as we can take reservations for them.
                    </p>
                    <Link href="/shop" className="button">Browse the shop</Link>
                </section>
            ) : (
                <section className="grid two-col">
                    {items.map((item) => (
                        <Link
                            key={item.variationId}
                            href={`/shop/${productHandle(item.name, item.variationId)}`}
                            className="card lift preorder-card"
                        >
                            {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="preorder-card-art" src={item.imageUrl} alt="" aria-hidden="true" />
                            ) : null}
                            <h2 className="preorder-card-name">{item.name}</h2>
                            <p className="preorder-card-when">
                                Arrives {preorderDateLabel(item.arrivesOn) || "soon"}
                            </p>
                            {item.price != null ? (
                                <p className="preorder-card-price">${Number(item.price).toFixed(2)}</p>
                            ) : null}
                        </Link>
                    ))}
                </section>
            )}
        </div>
    );
}
