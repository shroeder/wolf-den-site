"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";

// ── DISCOVER ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md. A second way to browse the shop, beside the existing one rather than replacing
// it. One item at a time, full-bleed, swipe for the next.
//
// ── ⚠️ A SWIPE NEVER BUYS, AND THIS IS THE LOAD-BEARING DECISION ─────────────────────────────────────────────
// The pack picker can treat a swipe casually: every pack is $20 and the outcome is a surprise either way.
// The shop is $1 to $500 against live single-copy stock, so the Tinder reading of this feature — right to
// buy, left to skip — is the one shape that must not ship. A mis-swipe that buys a $258 Jirachi is a refund,
// a restock and a phone call.
//
//   swipe = move on, with no consequence
//   tap   = inspect
//   a deliberate button = Add to cart
//
// ⚠️ AND IT ADDS TO THE SHOP'S EXISTING CART, not a fast lane of its own. Luke chose the cart, and the real
// win is what it rules out: a Buy-now path would be a SECOND way to decrement the same single-copy stock
// next to the cart's, which is the exact shape that produced the Square double-decrement that read as theft.
// One purchase path, one decrement path. It also means four cards ship on one shipping charge.
//
// ── ⚠️ VERTICAL SNAP, NOT A DRAG HANDLER ─────────────────────────────────────────────────────────────────────
// The whole deck is one `scroll-snap-type: y mandatory` column. The browser owns the physics, which means
// momentum, rubber-banding and accessibility all come free and correct — and, more to the point, nothing
// here captures the pointer, so there is no gesture to collide with a tap. Every bespoke swipe handler this
// house has written eventually ate a click.

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function DiscoverClient() {
    const [items, setItems] = useState([]);
    const [games, setGames] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [asked, setAsked] = useState(true);
    const [picked, setPicked] = useState([]);
    const [budget, setBudget] = useState("any");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);
    const [adding, setAdding] = useState("");
    const [added, setAdded] = useState({});
    // ⚠️ A REF, NOT STATE. Skipped ids feed the NEXT fetch and nothing renders from them; as state every
    //    swipe would re-render the whole deck mid-scroll, which is exactly when a re-render is most visible.
    const seen = useRef([]);
    // ── ⚠️ THE DECK IS NOT 100dvh, IT IS WHAT IS LEFT ──────────────────────────────────────────────────
    // This page renders under the site header and the HUD bar, so a card sized to the full viewport pushes
    // its own name, price and Add-to-cart button below the fold — which is the entire bottom half of the
    // feature. Shipped exactly that way for one build.
    //
    // Measured rather than hard-coded: the chrome above differs between signed-in and signed-out, and will
    // differ again the next time a bar is added. A magic number here is a number that is wrong later.
    const trackRef = useRef(null);
    const [deckH, setDeckH] = useState(null);
    useEffect(() => {
        const measure = () => {
            const top = trackRef.current?.getBoundingClientRect().top ?? 0;
            setDeckH(Math.max(320, Math.round(window.innerHeight - top)));
        };
        measure();
        window.addEventListener("resize", measure);
        // Mobile browsers change innerHeight as the URL bar hides; orientation change fires resize too.
        return () => window.removeEventListener("resize", measure);
    }, []);

    const load = useCallback(async (opts = {}) => {
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams();
            const g = opts.games ?? picked;
            if (g.length) qs.set("games", g.join(","));
            qs.set("budget", opts.budget ?? budget);
            if (seen.current.length) qs.set("skip", seen.current.slice(-300).join(","));
            const res = await fetch(`/api/marketplace/discover?${qs}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.open) throw new Error("closed");
            setItems(data.items || []);
            setGames(data.games || []);
            setBudgets(data.budgets || []);
            setAsked(Boolean(data.asked));
            if (!picked.length && (data.knownGames || []).length) setPicked(data.knownGames);
        } catch {
            setError("Couldn't load the shop just then.");
        } finally {
            setLoading(false);
        }
    }, [picked, budget]);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; filters call load() themselves
    useEffect(() => { load(); }, []);

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

    // ── THE QUIZ ────────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ SKIPPABLE FROM THE FIRST FRAME, and pre-filled from the profile. Four questions before anybody
    //    sees a card is four chances to leave; this is two, and "Show me everything" is always present.
    if (!asked && !loading) {
        return (
            <div className="dv-quiz">
                <h2 className="dv-quiz-h">What are you into?</h2>
                <p className="dv-quiz-sub">Two questions, then we&apos;ll stop asking.</p>

                <div className="dv-quiz-group">
                    {games.map((g) => (
                        <button
                            key={g.key}
                            type="button"
                            className={`dv-chip${picked.includes(g.key) ? " dv-chip-on" : ""}`}
                            onClick={() => setPicked((p) => (p.includes(g.key) ? p.filter((x) => x !== g.key) : [...p, g.key]))}
                        >
                            {g.label}
                        </button>
                    ))}
                </div>

                <div className="dv-quiz-group">
                    {budgets.map((b) => (
                        <button
                            key={b.key}
                            type="button"
                            className={`dv-chip${budget === b.key ? " dv-chip-on" : ""}`}
                            onClick={() => setBudget(b.key)}
                        >
                            {b.label}
                        </button>
                    ))}
                </div>

                <div className="dv-quiz-actions">
                    <button
                        type="button"
                        className="dv-btn dv-btn-primary"
                        onClick={async () => {
                            // Written to the profile the whole site uses, never a Discover-only copy.
                            if (picked.length) {
                                await fetch("/api/marketplace/discover", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ games: picked }),
                                }).catch(() => {});
                            }
                            setAsked(true);
                            load({ games: picked, budget });
                        }}
                    >
                        Start
                    </button>
                    <button
                        type="button"
                        className="dv-btn dv-btn-ghost"
                        onClick={() => { setAsked(true); load({ games: [], budget: "any" }); }}
                    >
                        Just show me everything
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="dv-wrap">
            {error ? <p className="dv-error">{error}</p> : null}

            {loading && !items.length ? <p className="dv-empty">Loading the shelf…</p> : null}
            {!loading && !items.length ? (
                <div className="dv-empty">
                    <p>Nothing matches that yet.</p>
                    <button type="button" className="dv-btn dv-btn-ghost" onClick={() => { setAsked(false); }}>
                        Change what you&apos;re after
                    </button>
                </div>
            ) : null}

            {/* ⚠️ scroll-snap on the TRACK, and every card is exactly one viewport. The browser owns the
                physics; nothing here captures the pointer, so a tap is still a tap. */}
            <div className="dv-track" ref={trackRef} style={deckH ? { height: `${deckH}px` } : undefined}>
                {items.map((item) => (
                    <article className="dv-card" key={item.id}>
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

                {/* ── ⚠️ AN EXPLICIT "more", NOT INFINITE SCROLL ──────────────────────────────────────
                    Infinite scroll in a snap deck means fetching while the user is mid-gesture, and a
                    list that grows under a scroll-snap container drags the snap point out from under
                    the card they are looking at. A card at the end of the deck is also the one honest
                    place to let somebody change their mind about the filters. */}
                {items.length ? (
                    <article className="dv-card dv-card-end">
                        <h3 className="dv-name">That&apos;s the batch.</h3>
                        <button
                            type="button"
                            className="dv-btn dv-btn-primary"
                            onClick={() => {
                                // Everything just shown is now "seen", so the next batch is genuinely new.
                                seen.current = [...seen.current, ...items.map((i) => i.id)];
                                load();
                            }}
                        >
                            Show me more
                        </button>
                        <button type="button" className="dv-btn dv-btn-ghost" onClick={() => setAsked(false)}>
                            Change what you&apos;re after
                        </button>
                    </article>
                ) : null}
            </div>

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
