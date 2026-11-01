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

                                <span className="po-chips">
                                    {item.soldOut
                                        ? <span className="po-chip po-chip-gone">Sold out</span>
                                        : <span className="po-chip">{shortDate(item.arrivesOn) || "Soon"}</span>}
                                    {!item.soldOut && item.listPrice != null && item.price != null ? (
                                        /* ⚠️ DOLLARS OR PERCENT, WHICHEVER IS THE BIGGER-SOUNDING TRUTH,
                                           and both are true. $10 off $550 is a real tenner and a feeble
                                           2%; $8.50 off $170 is a respectable 5% and a forgettable number
                                           of dollars. Percent flatters cheap things, dollars flatter dear
                                           ones, so the chip picks per item. */
                                        <span className="po-chip po-chip-save">
                                            {(item.listPrice - item.price) >= 10
                                                ? `Save $${Math.round(item.listPrice - item.price)}`
                                                : `Save ${Math.round((1 - item.price / item.listPrice) * 100)}%`}
                                        </span>
                                    ) : null}
                                </span>

                                {/* The price sits ON the art, over a scrim, the way a storefront puts a
                                    ticket on the box rather than on a label underneath it. */}
                                {item.price != null ? (
                                    <span className="po-money">
                                        {item.listPrice != null ? (
                                            <s>${Number(item.listPrice).toFixed(2)}</s>
                                        ) : null}
                                        <b>${Number(item.price).toFixed(2)}</b>
                                    </span>
                                ) : null}
                            </div>

                            <div className="po-foot">
                                <p className="po-name">{plain(item.name)}</p>
                                {/* ── ⚠️ NOT A BUTTON ─────────────────────────────────────────────────
                                    Luke, twice in one day on two different screens: "I hate the yellow
                                    button", "dont like the buttons at all". A filled gold lozenge inside
                                    every tile fights the box art it is sitting under, and the whole tile
                                    is already the link — the pill was a control drawn inside a control.
                                    A single amber line with an arrow says the same thing and lets the
                                    product be the loudest object on the page. */}
                                <span className="po-go">
                                    {item.soldOut ? "All reserved" : "Reserve"}
                                    {item.soldOut ? null : <i aria-hidden="true">&rarr;</i>}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
