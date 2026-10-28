"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";

// ── DISCOVER ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md. Luke, 2026-10-27, on the first build:
//
//   "I want the new view to be horizontally scrollable, just like mystery packs where you quickly swipe left
//    and right. Also it's putting me in a category before I even get a chance to say what I'm into. You
//    should be able to switch category by just scrolling up and down... and that should be clear that you
//    can swipe up or down to change categories."
//
// ── ⚠️ TWO AXES, AND THEY MEAN DIFFERENT THINGS ──────────────────────────────────────────────────────────────
//
//     ←  →   ITEMS inside a category   — the mystery-pack picker's gesture, applied to real stock
//     ↑  ↓   CATEGORIES
//
// ⚠️ THE QUIZ IS GONE, NOT MOVED. The first cut asked two questions and used the answers to decide which
// category you landed in, so anyone who had not answered was dropped somewhere arbitrary with no way out.
// Vertical navigation makes the categories the chooser — you are never trapped in one, so there is nothing
// to ask. A question the interface can answer by being used should not be asked.
//
// ── ⚠️ A SWIPE NEVER BUYS ────────────────────────────────────────────────────────────────────────────────────
// The pack picker can be casual about a swipe: every pack is $20 and the outcome is a surprise either way.
// The shop is $1 to $500 against live single-copy stock, so the Tinder reading — right to buy — is the one
// shape that must not ship. Swipe moves, tap inspects, a deliberate button adds to cart. And it adds to the
// SHOP'S cart, not a fast lane: a second purchase path would be a second way to decrement the same
// single-copy stock, which is the exact shape behind the Square double-decrement that once read as theft.
//
// ── ⚠️ NESTED SCROLL-SNAP, NOT A GESTURE LIBRARY ─────────────────────────────────────────────────────────────
// Vertical snap on the outer scroller, horizontal snap inside each row. The browser routes a gesture by its
// dominant axis, gives momentum and rubber-banding for free, and — because nothing captures the pointer — a
// tap is still a tap. Every hand-rolled swipe handler in this codebase has eventually eaten a click.

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function DiscoverClient() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);
    const [adding, setAdding] = useState("");
    const [added, setAdded] = useState({});
    const [rowIndex, setRowIndex] = useState(0);

    // ── ⚠️ THE DECK IS NOT 100dvh, IT IS WHAT IS LEFT ──────────────────────────────────────────────────
    // This page renders under the site header and the HUD bar. A card sized to the full viewport pushes its
    // own name, price and Add-to-cart below the fold — the entire bottom half of the feature, which is how
    // the first build shipped. Measured rather than hard-coded: the chrome differs signed-in vs out and
    // will differ again the next time a bar is added.
    const deckRef = useRef(null);
    const [deckH, setDeckH] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/marketplace/discover", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.open) throw new Error("closed");
            setRows(data.rows || []);
        } catch {
            setError("Couldn't load the shop just then.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Re-measured once the deck actually exists, and on resize — mobile browsers change innerHeight as the
    // URL bar hides.
    useEffect(() => {
        if (loading) return undefined;
        const measure = () => {
            const top = deckRef.current?.getBoundingClientRect().top ?? 0;
            setDeckH(Math.max(360, Math.round(window.innerHeight - top)));
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [loading]);

    async function addToCart(item) {
        setAdding(item.id);
        try {
            const res = await fetch("/api/shop/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The shop's own contract, unchanged — see ShopInventoryClient.
                body: JSON.stringify({ action: "add", catalogObjectId: item.id, quantity: 1 }),
            });
            if (!res.ok) throw new Error("cart");
            Haptic.tap();
            setAdded((a) => ({ ...a, [item.id]: true }));
            // The header cart badge listens for this; Discover must not be the one view that leaves it stale.
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch {
            setError("Couldn't add that to the cart.");
        } finally {
            setAdding("");
        }
    }

    if (loading && !rows.length) return <p className="dv-empty">Loading the shelf…</p>;
    if (error && !rows.length) return <p className="dv-error">{error}</p>;
    if (!rows.length) return <p className="dv-empty">Nothing on the shelf with a photo right now.</p>;

    const nextRow = rows[rowIndex + 1] || null;

    return (
        <div className="dv-wrap" ref={deckRef} style={deckH ? { height: `${deckH}px` } : undefined}>
            {error ? <p className="dv-error dv-error-float">{error}</p> : null}

            {/* ── THE VERTICAL AXIS: CATEGORIES ──────────────────────────────────────────────────────────
                ⚠️ onScroll DERIVES the index from scrollTop; it never drives the scrolling. Driving it
                   would fight the browser's own snap physics mid-gesture. Reading is free and always
                   agrees with what is actually on screen. */}
            <div
                className="dv-rows"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    const h = el.clientHeight || 1;
                    const i = Math.max(0, Math.min(rows.length - 1, Math.round(el.scrollTop / h)));
                    if (i !== rowIndex) setRowIndex(i);
                }}
            >
                {rows.map((row) => (
                    <section className="dv-row" key={row.key}>
                        <header className="dv-row-head">
                            <h2 className="dv-row-name">{row.label}</h2>
                            <span className="dv-row-count">{row.total} in stock</span>
                        </header>

                        {/* The horizontal axis: items. */}
                        <div className="dv-items">
                            {row.items.map((item) => (
                                <article className="dv-item" key={item.id}>
                                    <button
                                        type="button"
                                        className="dv-art"
                                        onClick={() => { Haptic.tap(); setDetail(item); }}
                                        aria-label={`${item.name}, ${usd(item.priceCents)} — see details`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                                    </button>
                                    <div className="dv-meta">
                                        <h3 className="dv-name">{item.name}</h3>
                                        <p className="dv-sub">
                                            <span className="dv-price">{usd(item.priceCents)}</span>
                                            {item.last ? <span className="dv-last">last one</span> : null}
                                        </p>
                                        <button
                                            type="button"
                                            className="dv-btn dv-btn-primary dv-add"
                                            disabled={adding === item.id || added[item.id]}
                                            onClick={() => addToCart(item)}
                                        >
                                            {added[item.id] ? "In your cart" : adding === item.id ? "Adding…" : "Add to cart"}
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            {/* ── ⚠️ THE UP/DOWN AFFORDANCE, WHICH IS THE WHOLE RISK OF THIS LAYOUT ───────────────────────
                Luke: "that should be clear that you can swipe up or down to change categories." A second
                axis nobody discovers is a second axis that does not exist — horizontal swiping is familiar
                enough that nobody will think to try vertical unless told.

                So it is said two ways at once, and NAMING THE NEXT CATEGORY is the strongest of them.
                "Magic Single Card ▾" is a reason to swipe; a bare chevron is only an instruction.

                ⚠️ pointer-events: none in the CSS — it sits over the scroller and must never swallow the
                   gesture it is advertising. */}
            {nextRow ? (
                <div className="dv-next" aria-hidden="true">
                    <span className="dv-next-arrow">▾</span>
                    <span className="dv-next-label">{nextRow.label}</span>
                </div>
            ) : null}

            {detail ? (
                <div className="dv-detail" role="dialog" aria-label={detail.name} onClick={() => setDetail(null)}>
                    <div className="dv-detail-card" onClick={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={detail.imageUrl} alt={detail.name} />
                        <h3>{detail.name}</h3>
                        <p className="dv-detail-cat">{detail.category}</p>
                        <p className="dv-detail-price">{usd(detail.priceCents)}</p>
                        <button
                            type="button"
                            className="dv-btn dv-btn-primary"
                            disabled={added[detail.id]}
                            onClick={() => addToCart(detail)}
                        >
                            {added[detail.id] ? "In your cart" : "Add to cart"}
                        </button>
                        <button type="button" className="dv-btn dv-btn-ghost" onClick={() => setDetail(null)}>Close</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
