"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";

// ── DISCOVER ─────────────────────────────────────────────────────────────────────────────────────────────────
// docs/shop-discover-view.md.
//
//     left/right   ITEMS inside a category   — the mystery-pack picker's gesture, on real stock
//     up/down      CATEGORIES
//
// ⚠️ A SWIPE NEVER BUYS. The shop is $1 to $500 against live single-copy stock, so the Tinder reading —
// right to buy — is the one shape that must not ship. Swipe moves, tap inspects, a deliberate button adds
// to cart. And it adds to the SHOP'S cart: a second purchase path would be a second way to decrement the
// same stock, the exact shape behind the Square double-decrement that once read as theft.
//
// ⚠️ NESTED SCROLL-SNAP, NOT A GESTURE LIBRARY. The browser routes a gesture by its dominant axis, gives
// momentum and rubber-banding free, and nothing captures the pointer — so a tap stays a tap. Every
// hand-rolled swipe handler in this codebase has eventually eaten a click.
//
// ⚠️ THE "APP" FEEL IS A CONSTRAINED COLUMN. On a wide monitor a full-bleed deck is one small card in an
// ocean of black, which reads as broken rather than minimal. Capped and centred: desktop looks framed on
// purpose, phone looks native, one layout with no breakpoint forks to drift.

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

// Start fetching the next page when this many cards remain to the right. Luke: "it should load ahead so
// the user never notices it loading." Six cards is several seconds of swiping at any realistic pace.
const LOOKAHEAD = 6;

/**
 * ⚠️ THE HORIZONTAL PAGER IS WINDOWED, AND IT HAS TO BE.
 *
 * Luke liked the vertical pips and asked for the same sideways. The difference is count: there are ten
 * categories and there can be nine hundred items, and nine hundred dots is a grey smear that says nothing.
 *
 * So it shows a fixed window around the current item with the outermost pips shrunk — the iOS page-dots
 * idiom. The row keeps a constant width whatever the length, which is what stops it twitching as you swipe.
 */
function windowPips(index, total, span = 9) {
    if (total <= span) return Array.from({ length: total }, (_, i) => ({ i, size: "md" }));
    const half = Math.floor(span / 2);
    let start = Math.max(0, Math.min(index - half, total - span));
    return Array.from({ length: span }, (_, k) => {
        const i = start + k;
        const edge = k === 0 || k === span - 1;
        const nearEdge = k === 1 || k === span - 2;
        const atListEnd = (i === 0) || (i === total - 1);
        return { i, size: edge && !atListEnd ? "xs" : nearEdge && !atListEnd ? "sm" : "md" };
    });
}

export default function DiscoverClient() {
    const [rows, setRows] = useState([]);
    const [eras, setEras] = useState([]);
    const [prices, setPrices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);
    const [adding, setAdding] = useState("");
    const [added, setAdded] = useState({});
    const [rowIndex, setRowIndex] = useState(0);
    const [itemIndex, setItemIndex] = useState({});

    // Filters. `draft` is what the sheet is editing; `applied` is what the deck is showing — so closing the
    // sheet without pressing anything cannot silently change the deck underneath.
    const [sheetOpen, setSheetOpen] = useState(false);
    const [applied, setApplied] = useState({ era: "any", price: "any", q: "" });
    const [draft, setDraft] = useState({ era: "any", price: "any", q: "" });

    // ⚠️ REFS, NOT STATE. In-flight page requests and the measured deck height: nothing renders from the
    //    first, and the second would re-render the whole deck mid-scroll.
    const fetching = useRef(new Set());
    const deckRef = useRef(null);
    const [deckH, setDeckH] = useState(null);

    const load = useCallback(async (f) => {
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams({ era: f.era, price: f.price });
            if (f.q) qs.set("q", f.q);
            const res = await fetch(`/api/marketplace/discover?${qs}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.open) throw new Error("closed");
            setRows(data.rows || []);
            setEras(data.eras || []);
            setPrices(data.prices || []);
            setItemIndex({});
            fetching.current.clear();
        } catch {
            setError("Couldn't load the shop just then.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load({ era: "any", price: "any", q: "" }); }, [load]);

    useEffect(() => {
        if (loading) return undefined;
        const measure = () => {
            const top = deckRef.current?.getBoundingClientRect().top ?? 0;
            // ⚠️ THE FLOOR MUST SIT BELOW ANY REAL VIEWPORT OR IT CAUSES THE BUG IT GUARDS AGAINST. At 380
            //    it made the deck taller than a 667px phone's available space and pushed Add to cart off
            //    the bottom. A minimum is a safety net for a degenerate measurement, not a layout decision.
            setDeckH(Math.max(240, Math.round(window.innerHeight - top)));
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [loading]);

    /**
     * ⚠️ LOAD AHEAD, NOT LOAD ON DEMAND. Fired when LOOKAHEAD cards remain, so the fetch lands long before
     * the swipe that would have needed it — the member never sees a spinner because there is never a moment
     * where the next card does not already exist.
     *
     * The in-flight set is keyed by row AND offset: without the offset a second page for the same row could
     * never start while the first was still open, which is exactly the case fast swiping produces.
     */
    const topUp = useCallback(async (row) => {
        if (row.items.length >= row.total) return;
        const key = `${row.key}:${row.items.length}`;
        if (fetching.current.has(key)) return;
        fetching.current.add(key);
        try {
            const qs = new URLSearchParams({
                row: row.key, offset: String(row.items.length),
                era: applied.era, price: applied.price,
            });
            if (applied.q) qs.set("q", applied.q);
            const res = await fetch(`/api/marketplace/discover?${qs}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !Array.isArray(data.items) || !data.items.length) return;
            setRows((rs) => rs.map((r) => {
                if (r.key !== row.key) return r;
                // ⚠️ DE-DUPED ON APPEND. The shop counter sells from this same shelf, so a page boundary
                //    can hand back a row that shifted — a duplicate key would blow up React, and a
                //    duplicate card would look like the deck stuttering.
                const have = new Set(r.items.map((i) => i.id));
                return { ...r, items: [...r.items, ...data.items.filter((i) => !have.has(i.id))] };
            }));
        } catch { /* a failed top-up just means the member reaches the end of what is loaded */ }
    }, [applied]);

    async function addToCart(item) {
        setAdding(item.id);
        try {
            const res = await fetch("/api/shop/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add", catalogObjectId: item.id, quantity: 1 }),
            });
            if (!res.ok) throw new Error("cart");
            Haptic.tap();
            setAdded((a) => ({ ...a, [item.id]: true }));
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch {
            setError("Couldn't add that to the cart.");
        } finally {
            setAdding("");
        }
    }

    const filtersOn = applied.era !== "any" || applied.price !== "any" || Boolean(applied.q);

    function openSheet() { setDraft(applied); setSheetOpen(true); }
    function applyDraft(next) {
        const f = next || draft;
        setApplied(f);
        setSheetOpen(false);
        load(f);
    }

    if (loading && !rows.length) {
        return <div className="dv-boot"><span className="dv-boot-dot" /><p>Opening the shelf…</p></div>;
    }

    const nextRow = rows[rowIndex + 1] || null;
    const current = rows[rowIndex];
    const curIdx = itemIndex[current?.key] || 0;

    return (
        <div className="dv-wrap" ref={deckRef} style={deckH ? { height: `${deckH}px` } : undefined}>
            {error ? <p className="dv-error dv-error-float">{error}</p> : null}

            {!rows.length ? (
                <div className="dv-none">
                    <p>Nothing matches that.</p>
                    <button type="button" className="dv-btn dv-add" onClick={() => applyDraft({ era: "any", price: "any", q: "" })}>
                        Clear filters
                    </button>
                </div>
            ) : (
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
                                <button
                                    type="button"
                                    className={`dv-filter${filtersOn ? " dv-filter-on" : ""}`}
                                    onClick={openSheet}
                                >
                                    {filtersOn ? "Filtered" : "Filter"}
                                    <span className="dv-filter-n">{row.total}</span>
                                </button>
                            </header>

                            <div
                                className="dv-items"
                                onScroll={(e) => {
                                    const el = e.currentTarget;
                                    const w = el.firstChild?.offsetWidth || 1;
                                    // ⚠️ Divided by the TRACK'S OWN CHILD WIDTH — it cannot drift from the
                                    //    snap points because it IS the snap point.
                                    const i = Math.max(0, Math.min(row.items.length - 1, Math.round(el.scrollLeft / w)));
                                    if ((itemIndex[row.key] || 0) !== i) {
                                        setItemIndex((m) => ({ ...m, [row.key]: i }));
                                    }
                                    if (i >= row.items.length - LOOKAHEAD) topUp(row);
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
                                            <img
                                                src={item.imageUrl}
                                                alt=""
                                                /* ⚠️ The first few load EAGERLY. lazy on the opening cards is
                                                   the one place it is wrong: it is the first thing anyone
                                                   sees, and a deck that opens on a grey rectangle has
                                                   already lost. */
                                                loading={i < 3 ? "eager" : "lazy"}
                                                decoding="async"
                                            />
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
            )}

            {/* The vertical pager: one pip per category down the right edge. */}
            {rows.length > 1 ? (
                <div className="dv-pager" aria-hidden="true">
                    {rows.map((r, i) => (
                        <span key={r.key} className={`dv-pip${i === rowIndex ? " dv-pip-on" : ""}`} />
                    ))}
                </div>
            ) : null}

            {/* The horizontal pager — the same idea turned sideways, windowed because a row can hold
                hundreds. See windowPips. */}
            {current && current.items.length > 1 ? (
                <div className="dv-hpager" aria-hidden="true">
                    {windowPips(curIdx, current.items.length).map((p) => (
                        <span
                            key={p.i}
                            className={`dv-hpip dv-hpip-${p.size}${p.i === curIdx ? " dv-hpip-on" : ""}`}
                        />
                    ))}
                </div>
            ) : null}

            {nextRow ? (
                <div className="dv-next" aria-hidden="true">
                    <span className="dv-next-label">{nextRow.label}</span>
                    <span className="dv-next-arrow">▾</span>
                </div>
            ) : null}

            {/* ── THE FILTER SHEET ───────────────────────────────────────────────────────────────────────
                Luke: "we need to try and ask the user questions about what they typically want. But it
                needs to just be an optional filter control, but not ghetto. It has to be really easy to
                use, appified, and just quick."

                So: chips, not dropdowns. Everything visible at once, one tap each, and it applies on tap
                rather than hiding behind an Apply button. The only typing is the name box, which is the
                one thing chips genuinely cannot express.

                ⚠️ IT EDITS A DRAFT. Closing without choosing leaves the deck exactly as it was — a sheet
                that mutates what is behind it as you poke at it is the "ghetto" version. */}
            {sheetOpen ? (
                <div className="dv-sheet" role="dialog" aria-label="Filter" onClick={() => setSheetOpen(false)}>
                    <div className="dv-sheet-card" onClick={(e) => e.stopPropagation()}>
                        <div className="dv-sheet-grip" />
                        <h3 className="dv-sheet-h">What are you after?</h3>

                        <input
                            className="dv-search"
                            placeholder="Charizard, Pikachu, a set…"
                            value={draft.q}
                            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") applyDraft(); }}
                        />

                        <div className="dv-sheet-group">
                            {eras.map((o) => (
                                <button
                                    key={o.key}
                                    type="button"
                                    className={`dv-chip${draft.era === o.key ? " dv-chip-on" : ""}`}
                                    onClick={() => setDraft((d) => ({ ...d, era: o.key }))}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        <div className="dv-sheet-group">
                            {prices.map((o) => (
                                <button
                                    key={o.key}
                                    type="button"
                                    className={`dv-chip${draft.price === o.key ? " dv-chip-on" : ""}`}
                                    onClick={() => setDraft((d) => ({ ...d, price: o.key }))}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        <button type="button" className="dv-btn dv-add" onClick={() => applyDraft()}>Show me</button>
                        {filtersOn ? (
                            <button
                                type="button"
                                className="dv-sheet-clear"
                                onClick={() => applyDraft({ era: "any", price: "any", q: "" })}
                            >
                                Clear everything
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {detail ? (
                <div className="dv-detail" role="dialog" aria-label={detail.name} onClick={() => setDetail(null)}>
                    <div className="dv-detail-card" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="dv-detail-x" onClick={() => setDetail(null)} aria-label="Close">×</button>
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
