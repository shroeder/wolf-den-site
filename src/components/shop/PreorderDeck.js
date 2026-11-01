"use client";

import Link from "next/link";
import { useState } from "react";

import { productHandle } from "@/lib/inventory-feed/product-url.js";

// ── THE PRE-ORDER SHELF, IN THE DISCOVER LANGUAGE ────────────────────────────────────────────────────────────
// Luke: "why don't you make it look like the newer shop experience? Fuck it. Where it's like the scrollable
// stuff on the phone."
//
// So this borrows Discover's grammar — one product per screen, art doing all the talking, a swipe sideways
// for the next one, pips underneath — and nothing else. Pre-orders stay their own page, which was the other
// half of his call.
//
// ⚠️ IT IS A CAROUSEL ON A PHONE AND A ROW ON A DESKTOP, AND THAT SPLIT IS DELIBERATE. Discover's own
// comment claims a capped, centred column "looks framed on purpose" at desktop width. Photographed at
// 1440×900 it does not: it is a 520px strip with 450px of black either side and one small card floating in
// it. Discover gets away with it because it is an owner-only experiment with 907 cards of depth behind the
// gesture. This shelf will hold two to five items, so a one-card-per-screen deck on a monitor would be a
// near-empty page that also hides most of the stock. Same cards, same treatment, laid out as a row.
//
// ⚠️ SCARCITY IS READ OFF REAL STOCK, NEVER DRESSED UP. Luke: "We should always try to create a sense of
// pressure with the amount of stock there is." An allocation IS genuinely finite — six collector displays
// is six — so the true number is pressure enough and nothing here invents urgency the shelf cannot back.
// No countdown, no "N people viewing", and the 5-minute reservation hold he floated is explicitly dropped.

const money = (n) => `$${Number(n).toFixed(2)}`;

// The "[Pre-Order] " prefix is load-bearing in Square — a cashier needs it on the POS — and pure noise on a
// shelf that is nothing but pre-orders, where it pushed every name onto a second line.
const plain = (name) => String(name || "").replace(/^\[Pre-Order\]\s*/i, "");

const shortDate = (value) => {
    if (!value) return null;
    const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const d = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/** The stock line. Returns null above the threshold — "23 left" is a statistic, "3 left" is a decision. */
function scarcity(quantity) {
    const n = Number(quantity);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n === 1) return "Last one";
    if (n <= 12) return `Only ${n} left`;
    return null;
}

export default function PreorderDeck({ items = [] }) {
    const [index, setIndex] = useState(0);
    if (!items.length) return null;

    return (
        <div className="pd">
            <div
                className="pd-track"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    // Divided by the track's OWN child width so it cannot drift from the snap points —
                    // it IS the snap point. Same trick Discover uses.
                    const w = el.firstChild?.offsetWidth || 1;
                    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w)));
                    if (i !== index) setIndex(i);
                }}
            >
                {items.map((item, i) => {
                    const left = scarcity(item.quantity);
                    const saving = item.listPrice != null && item.price != null
                        ? item.listPrice - item.price
                        : 0;

                    return (
                        <article
                            className={`pd-card${i === index ? " pd-card-on" : ""}${item.soldOut ? " pd-card-gone" : ""}`}
                            key={item.variationId}
                        >
                            <Link
                                href={`/shop/${productHandle(item.name, item.variationId)}`}
                                className="pd-art"
                                aria-label={`${plain(item.name)} — reserve`}
                            >
                                {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={item.imageUrl}
                                        alt=""
                                        /* The opening cards load eagerly: a shelf that opens on a grey
                                           rectangle has already lost. */
                                        loading={i < 2 ? "eager" : "lazy"}
                                        decoding="async"
                                    />
                                ) : <span className="pd-art-none">No image yet</span>}
                            </Link>

                            <div className="pd-meta">
                                <p className="pd-when">
                                    {item.soldOut ? (
                                        <span className="pd-when-gone">All reserved</span>
                                    ) : (
                                        <>
                                            <span className="pd-when-dot" aria-hidden="true" />
                                            Lands {shortDate(item.arrivesOn) || "soon"}
                                        </>
                                    )}
                                </p>

                                <h2 className="pd-name">{plain(item.name)}</h2>

                                <p className="pd-sub">
                                    {item.listPrice != null ? (
                                        <s className="pd-was">{money(item.listPrice)}</s>
                                    ) : null}
                                    <span className="pd-price">{money(item.price)}</span>
                                    {saving > 0 ? (
                                        /* ⚠️ DOLLARS OR PERCENT, WHICHEVER IS THE BIGGER-SOUNDING TRUTH, and
                                           both are true. $10 off $550 is a real tenner and a feeble 2%;
                                           $8.50 off $170 is a respectable 5% and a forgettable number of
                                           dollars. Percent flatters cheap things, dollars flatter dear ones. */
                                        <span className="pd-save">
                                            {saving >= 10
                                                ? `Save $${Math.round(saving)}`
                                                : `Save ${Math.round((saving / item.listPrice) * 100)}%`}
                                        </span>
                                    ) : null}
                                </p>

                                {left && !item.soldOut ? <p className="pd-left">{left}</p> : null}

                                {item.soldOut ? (
                                    <span className="pd-btn pd-btn-gone">This allocation is spoken for</span>
                                ) : (
                                    <Link
                                        href={`/shop/${productHandle(item.name, item.variationId)}`}
                                        className="pd-btn"
                                    >
                                        Reserve &middot; {money(item.price)}
                                    </Link>
                                )}

                                {/* The one line of explanation anybody needs, under the control rather than
                                    above the shelf in a paragraph nobody reads. */}
                                <p className="pd-fine">Pay today &middot; we email you the day it lands</p>
                            </div>
                        </article>
                    );
                })}
            </div>

            {items.length > 1 ? (
                <div className="pd-pips" aria-hidden="true">
                    {items.map((item, i) => (
                        <span key={item.variationId} className={`pd-pip${i === index ? " pd-pip-on" : ""}`} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
