import Link from "next/link";

import PreorderDeck from "@/components/shop/PreorderDeck";
import ViewPing from "@/components/ViewPing";
import { listPreorderShopItems } from "@/lib/inventory-feed/feed.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Pre-orders | The Wolf Den",
    description:
        "Upcoming releases you can reserve now at The Wolf Den in Montgomery, MN. Pay today, and we ship or hold it the day it lands.",
};

// ── THE PRE-ORDER SHELF ──────────────────────────────────────────────────────────────────────────────────
// Luke: "I hate the pre-orders page its verbose and ghetto", then "the call to action isnt clear", then
// "needs more sexyness and dont like the buttons at all", and finally "make it look like the newer shop
// experience. Where it's like the scrollable stuff on the phone."
//
// Everything that was wrong with the first three cuts was the same thing: the page talked. A five-line
// paragraph explaining what a pre-order is, a shouting yellow heading, a grid of small tiles with the
// product reduced to a thumbnail. The layout now lives in PreorderDeck and the page is a heading and a
// shelf — which is all a shop page has ever been.
export default async function PreordersPage() {
    const items = await listPreorderShopItems().catch(() => []);

    return (
        <div className="stack reveal">
            <ViewPing event="view_preorders" />

            <div className="po-head">
                <h1>Pre-orders</h1>
                {/* One line. The rest of the deal is printed under the button on each card, where the
                    person deciding is actually looking. */}
                <p>Reserve an upcoming release before it lands.</p>
            </div>

            {items.length === 0 ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>Nothing on pre-order right now</h2>
                    <p className="muted">
                        Everything we have is in the building and ready to go. New releases turn up here as soon
                        as we can take reservations for them.
                    </p>
                    <Link href="/shop" className="button">Browse the shop</Link>
                </section>
            ) : (
                <PreorderDeck items={items} />
            )}
        </div>
    );
}
