import Link from "next/link";

import ViewPing from "@/components/ViewPing";
import { listPreorderShopItems } from "@/lib/inventory-feed/feed.js";
import { productHandle } from "@/lib/inventory-feed/product-url.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Pre-orders | The Wolf Den",
    description:
        "Upcoming releases you can reserve now at The Wolf Den in Montgomery, MN. Pay today, and we ship or hold it the day it lands.",
};

// ── THE PRE-ORDER SHELF ──────────────────────────────────────────────────────────────────────────────────
// Luke: "I hate the pre-orders page its verbose and ghetto."
//
// He was right. The first cut opened with a five-line grey paragraph explaining the concept, then stacked
// full-width cards whose two-line yellow headings shouted over the box art. A shop page is a grid of
// things you can buy; this was an essay with products underneath it.
//
// ⚠️ THE PICTURE IS THE PRODUCT. Two up, art filling the tile, and everything else kept to one line each:
// a date chip, the name, the price. Nobody reads a paragraph on a shop page and nobody needed to — a chip
// saying NOV 13 explains a pre-order faster than fifty words.
//
// ⚠️ AND THE "[Pre-Order] " PREFIX IS STRIPPED FOR DISPLAY HERE. It is load-bearing in Square, where a
// cashier needs it on the POS, and pure noise on a page that is nothing but pre-orders — it pushed every
// name onto a second line and buried the thing the customer is actually looking for.
const plain = (name) => String(name || "").replace(/^\[Pre-Order\]\s*/i, "");

const shortDate = (value) => {
    if (!value) return null;
    const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const d = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
};

export default async function PreordersPage() {
    const items = await listPreorderShopItems().catch(() => []);

    return (
        <div className="stack reveal">
            <ViewPing event="view_preorders" />

            <div className="po-head">
                <h1>Pre-orders</h1>
                {/* One line. Pay now, we tell you when it lands — that is the whole deal. */}
                <p>Reserve it now, pay now. We email you the day it reaches the shop.</p>
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
                <div className="po-grid">
                    {items.map((item) => (
                        <Link
                            key={item.variationId}
                            href={`/shop/${productHandle(item.name, item.variationId)}`}
                            className="po-tile"
                        >
                            <div className="po-art">
                                {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt="" aria-hidden="true" />
                                ) : <span className="po-art-none">No image</span>}
                                {item.soldOut
                                    ? <span className="po-chip po-chip-gone">SOLD OUT</span>
                                    : <span className="po-chip">{shortDate(item.arrivesOn) || "SOON"}</span>}
                                {!item.soldOut && item.listPrice != null && item.price != null ? (
                                    <span className="po-chip po-chip-save">
                                        {Math.round((1 - item.price / item.listPrice) * 100)}% OFF
                                    </span>
                                ) : null}
                            </div>
                            <p className="po-name">{plain(item.name)}</p>
                            {/* ── ⚠️ THE TILE HAD NO CALL TO ACTION ───────────────────────────────
                                Luke: "The call to action isnt clear." Art, a name and a price is a
                                catalogue entry — it tells you what the thing is and never once says what
                                to do about it, and "pre-order" is the one word a shopper needs permission
                                to believe. The price now sits INSIDE the verb, so the action and its cost
                                are one thing to read rather than two. */}
                            {item.soldOut ? (
                                <span className="po-cta po-cta-gone">All reserved</span>
                            ) : (
                                <span className="po-cta">
                                    Reserve
                                    {/* The struck price is the regular price we recorded, never a computed
                                        one — see migration 508. No record, no strike. */}
                                    {item.listPrice != null ? (
                                        <s>${Number(item.listPrice).toFixed(2)}</s>
                                    ) : null}
                                    {item.price != null ? <b>${Number(item.price).toFixed(2)}</b> : null}
                                </span>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
