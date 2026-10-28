"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";

// ── DISCOVER ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md. Luke: "make it look amazing... it's supposed to be this appified feel, super
// sleek and sexy and work properly in all screen sizes."
//
// ── TWO AXES, AND THEY MEAN DIFFERENT THINGS ─────────────────────────────────────────────────────────────────
//
//     left/right   ITEMS inside a category   — the mystery-pack picker's gesture, on real stock
//     up/down      CATEGORIES
//
// ⚠️ NO QUIZ. An earlier cut asked two questions and used the answers to decide which category you landed
// in, so anyone who had not answered got dropped somewhere arbitrary with no way out. Vertical navigation
// makes the categories the chooser — you are never trapped, so there is nothing to ask.
//
// ── ⚠️ A SWIPE NEVER BUYS ────────────────────────────────────────────────────────────────────────────────────
// The shop is $1 to $500 against live single-copy stock, so the Tinder reading — right to buy — is the one
// shape that must not ship. Swipe moves, tap inspects, a deliberate button adds to cart. And it adds to the
// SHOP'S cart: a second purchase path would be a second way to decrement the same stock, which is the exact
// shape behind the Square double-decrement that once read as theft.
//
// ── ⚠️ NESTED SCROLL-SNAP, NOT A GESTURE LIBRARY ─────────────────────────────────────────────────────────────
// Vertical snap outside, horizontal inside. The browser routes by dominant axis, gives momentum and
// rubber-banding free, and nothing captures the pointer — so a tap stays a tap. Every hand-rolled swipe
// handler in this codebase has eventually eaten a click.
//
// ── ⚠️ AND THE "APP" FEELING IS A CONSTRAINED COLUMN, NOT A STRETCHED PAGE ───────────────────────────────────
// On a 1500px monitor the first build put one small card in an ocean of black, which reads as broken rather
// than as minimal. The deck is capped at a phone-ish column and centred, so a desktop looks like an app
// someone deliberately framed and a phone looks native. One layout, no breakpoint forks to drift.

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function DiscoverClient() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);
    const [adding, setAdding] = useState("");
    const [added, setAdded] = useState({});
    const [rowIndex, setRowIndex] = useState(0);
    // Which item is centred, per row key — drives the focus treatment and the "3 of 24" counter.
    const [itemIndex, setItemIndex] = useState({});

    // ── ⚠️ THE DECK IS NOT 100dvh, IT IS WHAT IS LEFT ──────────────────────────────────────────────────
    // This page renders under the site header and the HUD bar. A card sized to the full viewport pushes its
    // own name, price and Add-to-cart below the fold — the entire bottom half of the feature, which is how
    // the first build shipped. Measured, not hard-coded: the chrome differs signed-in vs out and will
    // differ again the next time a bar is added.
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

    useEffect(() => {
        if (loading) return undefined;
        const measure = () => {
            const top = deckRef.current?.getBoundingClientRect().top ?? 0;
            // ⚠️ THE FLOOR MUST BE BELOW ANY REAL VIEWPORT, OR IT CAUSES THE BUG IT GUARDS AGAINST.
            //    This was 380. On a 667px phone minus ~226px of browser chrome the deck has 326px, so the
            //    floor made it 380 — taller than the space — and Add to cart fell off the bottom by
            //    exactly the overflow. A minimum is only a safety net for a degenerate measurement (a
            //    hidden or not-yet-laid-out element), never a layout decision.
            setDeckH(Math.max(240, Math.round(window.innerHeight - top)));
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

    if (loading && !rows.length) {
        return (
            <div className="dv-boot">
                <span className="dv-boot-dot" />
                <p>Opening the shelf…</p>
            </div>
        );
    }
    if (error && !rows.length) return <p className="dv-error">{error}</p>;
    if (!rows.length) return <p className="dv-empty">Nothing on the shelf with a photo right now.</p>;

    const nextRow = rows[rowIndex + 1] || null;
    const current = rows[rowIndex];
    const curItem = (itemIndex[current?.key] || 0) + 1;

    return (
        <div className="dv-wrap" ref={deckRef} style={deckH ? { height: `${deckH}px` } : undefined}>
            {error ? <p className="dv-error dv-error-float">{error}</p> : null}

            {/* ── THE VERTICAL AXIS: CATEGORIES ──────────────────────────────────────────────────────────
                ⚠️ onScroll DERIVES the index from scrollTop; it never drives the scrolling. Driving it
                   would fight the browser's own snap physics mid-gesture. Reading is free and always
                   agrees with what is on screen. */}
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
                            <span className="dv-row-count">{row.total}</span>
                        </header>

                        <div
                            className="dv-items"
                            onScroll={(e) => {
                                const el = e.currentTarget;
                                const w = el.firstChild?.offsetWidth || 1;
                                // ⚠️ Divided by the TRACK'S OWN CHILD WIDTH, which cannot drift from the
                                //    snap points because it IS the snap point. The pack carousel learned
                                //    this the hard way with a hard-coded card width.
                                const i = Math.max(0, Math.min(row.items.length - 1, Math.round(el.scrollLeft / w)));
                                if ((itemIndex[row.key] || 0) !== i) {
                                    setItemIndex((m) => ({ ...m, [row.key]: i }));
                                }
                            }}
                        >
                            {row.items.map((item, i) => (
                                <article
                                    className={`dv-item${(itemIndex[row.key] || 0) === i ? " dv-item-on" : ""}`}
                                    key={item.id}
                                >
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
                                            className={`dv-btn dv-add${added[item.id] ? " dv-add-done" : ""}`}
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

            {/* ── ⚠️ THE CATEGORY PAGER ──────────────────────────────────────────────────────────────────
                A dot per category down the right edge. It does three jobs for almost no pixels: it says
                a vertical axis EXISTS, it says how far through it you are, and it stops ten categories
                feeling like an endless scroll with no shape.
                pointer-events: none — it sits over the scroller and must never eat the gesture. */}
            <div className="dv-pager" aria-hidden="true">
                {rows.map((r, i) => (
                    <span key={r.key} className={`dv-pip${i === rowIndex ? " dv-pip-on" : ""}`} />
                ))}
            </div>

            {/* Where you are inside the current row. "3 of 24" is the cheapest possible way to say the
                sideways axis has depth, and it moves as you swipe, which is what makes it feel alive. */}
            {current ? (
                <div className="dv-count" aria-hidden="true">
                    {curItem} <i>of</i> {current.items.length}
                </div>
            ) : null}

            {/* ── ⚠️ THE UP/DOWN AFFORDANCE ──────────────────────────────────────────────────────────────
                Luke: "that should be clear that you can swipe up or down to change categories." A second
                axis nobody discovers does not exist, and horizontal swiping is familiar enough that nobody
                tries vertical unless told. NAMING the next category is the strongest version: "Magic
                Single Card ▾" is a reason to swipe, where a bare chevron is only an instruction. */}
            {nextRow ? (
                <div className="dv-next" aria-hidden="true">
                    <span className="dv-next-label">{nextRow.label}</span>
                    <span className="dv-next-arrow">▾</span>
                </div>
            ) : null}

            {detail ? (
                <div className="dv-detail" role="dialog" aria-label={detail.name} onClick={() => setDetail(null)}>
                    <div className="dv-detail-card" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="dv-detail-x"
                            onClick={() => setDetail(null)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={detail.imageUrl} alt={detail.name} />
                        <h3>{detail.name}</h3>
                        <p className="dv-detail-cat">{detail.category}</p>
                        <p className="dv-detail-price">{usd(detail.priceCents)}</p>
                        <button
                            type="button"
                            className={`dv-btn dv-add${added[detail.id] ? " dv-add-done" : ""}`}
                            disabled={added[detail.id]}
                            onClick={() => addToCart(detail)}
                        >
                            {added[detail.id] ? "In your cart" : "Add to cart"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
