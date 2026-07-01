"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import VendorImportClient from "@/components/VendorImportClient";

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const GRADERS = ["PSA", "BGS", "CGC", "SGC", "TAG", "ACE", "Other"];
// Keep in sync with LISTING_LANGUAGES in lib/marketplace/listings.js (server-only, can't import here).
const LANGUAGES = [
    "English",
    "Japanese",
    "Chinese (Simplified)",
    "Chinese (Traditional)",
    "Korean",
    "German",
    "French",
    "Italian",
    "Spanish",
    "Portuguese",
    "Russian",
    "Thai",
    "Indonesian",
];
const DEFAULT_GAMES = [{ id: "", label: "All" }];

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatPrice(value) {
    return value === null || value === undefined ? "—" : priceFormatter.format(Number(value));
}

function timeAgo(iso) {
    const then = Date.parse(iso || "");
    if (Number.isNaN(then)) return "";
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

const REQUEST_STATUS_LABELS = {
    new: "New",
    responded: "Replied",
    sold: "Sold",
    closed: "Closed",
};

// Infer sealed vs single from a catalog product: sealed product names match these keywords; otherwise
// a collector number or rarity means it's a single.
const SEALED_NAME = /booster box|booster bundle|elite trainer|\betb\b|premium collection|collection box|\btin\b|blister|booster pack|build & battle|\bbundle\b|\bcase\b|display|sealed/i;

function inferKind(product) {
    if (SEALED_NAME.test(String(product?.name || ""))) {
        return "sealed";
    }
    return product?.number || product?.rarity ? "single" : "sealed";
}

function AddListingForm({ onAdded, defaultPricingMode = "manual", defaultPricingValue = null }) {
    const [games, setGames] = useState(DEFAULT_GAMES);
    const [game, setGame] = useState("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(null);
    const [title, setTitle] = useState("");
    const [kind, setKind] = useState("sealed");
    const [condition, setCondition] = useState("NM");
    const [graded, setGraded] = useState(false);
    const [gradingCompany, setGradingCompany] = useState("PSA");
    const [grade, setGrade] = useState("");
    const [language, setLanguage] = useState("English");
    const [price, setPrice] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [pricing, setPricing] = useState(null);
    const [autoMode, setAutoMode] = useState(defaultPricingMode || "manual");
    const [pctInput, setPctInput] = useState(
        defaultPricingMode === "market_pct" && defaultPricingValue ? String(Math.round(defaultPricingValue * 100)) : "90"
    );
    const [undercutInput, setUndercutInput] = useState(
        defaultPricingMode === "match_lowest" && defaultPricingValue != null ? String(defaultPricingValue) : "0"
    );
    const [saveDefault, setSaveDefault] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef(null);

    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/marketplace/games");
                const data = await response.json().catch(() => null);
                if (!ignore && response.ok && Array.isArray(data?.games)) {
                    setGames([{ id: "", label: "All" }, ...data.games.map((g) => ({ id: g.slug, label: g.label }))]);
                }
            } catch {
                /* keep the default */
            }
        })();

        return () => {
            ignore = true;
        };
    }, []);

    useEffect(() => {
        const trimmed = query.trim();

        // All state updates happen inside the deferred callback (never synchronously in the effect body).
        const handle = setTimeout(async () => {
            if (trimmed.length < 2 || (selected && selected.name === trimmed)) {
                setResults([]);
                return;
            }

            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const params = new URLSearchParams({ q: trimmed });
                if (game) params.set("game", game);
                const response = await fetch(`/api/marketplace/vendor/catalog-search?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => null);
                if (response.ok) setResults(Array.isArray(data?.results) ? data.results : []);
            } catch {
                /* ignore */
            }
        }, trimmed.length < 2 ? 0 : 250);

        return () => clearTimeout(handle);
    }, [query, game, selected]);

    // Pull pricing context (market + lowest competing vendor) whenever a matched product is selected.
    useEffect(() => {
        let ignore = false;
        const id = selected?.catalogProductId;

        (async () => {
            if (!id) {
                if (!ignore) setPricing(null);
                return;
            }
            try {
                const response = await fetch(`/api/marketplace/vendor/product-pricing?catalogProductId=${id}`, { cache: "no-store" });
                const data = await response.json().catch(() => null);
                if (!ignore) setPricing(response.ok ? data : null);
            } catch {
                if (!ignore) setPricing(null);
            }
        })();

        return () => {
            ignore = true;
        };
    }, [selected?.catalogProductId]);

    function pick(product) {
        setSelected(product);
        setTitle(product.name);
        setKind(inferKind(product));
    }

    function startManual() {
        setSelected({ catalogProductId: null, name: "", setName: null, number: null, imageUrl: null, game: null, marketPrice: null, manual: true });
        setTitle("");
    }

    async function submit(event) {
        event.preventDefault();
        setError("");

        if (!title.trim()) {
            setError("Pick a product or enter a title.");
            return;
        }
        const market = pricing?.marketPrice ?? selected?.marketPrice ?? null;
        const lowest = pricing?.lowestPrice ?? null;
        const round2 = (n) => Math.round(n * 100) / 100;

        let pricingValue = null;
        let submitPrice;
        if (autoMode === "market_pct") {
            pricingValue = Number(pctInput) / 100;
            if (!(pricingValue > 0) || market == null) {
                setError("Auto % pricing needs a catalog-matched product. Pick one, or use Manual.");
                return;
            }
            submitPrice = round2(market * pricingValue);
        } else if (autoMode === "match_lowest") {
            pricingValue = Number(undercutInput) || 0;
            const base = lowest ?? market;
            if (base == null) {
                setError("Match-lowest needs a catalog-matched product. Pick one, or use Manual.");
                return;
            }
            submitPrice = Math.max(0, round2(base - pricingValue));
        } else {
            if (price === "" || Number(price) < 0) {
                setError("Enter a valid price.");
                return;
            }
            submitPrice = Number(price);
        }

        setBusy(true);

        try {
            const response = await fetch("/api/marketplace/vendor/listings", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    kind,
                    condition: kind === "single" && !graded ? condition : null,
                    graded: kind === "single" ? graded : false,
                    gradingCompany: kind === "single" && graded ? gradingCompany : null,
                    grade: kind === "single" && graded ? grade.trim() : null,
                    language,
                    price: submitPrice,
                    pricingMode: autoMode,
                    pricingValue,
                    quantity: Number(quantity) || 1,
                    title: title.trim(),
                    catalogProductId: selected?.catalogProductId || null,
                    game: selected?.game || game || null,
                    setName: selected?.setName || null,
                    cardNumber: selected?.number || null,
                    imageUrl: selected?.imageUrl || null,
                }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not add the listing.");
            }

            if (saveDefault && autoMode !== "manual") {
                fetch("/api/marketplace/vendor/pricing-default", {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ mode: autoMode, value: pricingValue }),
                }).catch(() => {});
            }

            // Reset.
            setSelected(null);
            setTitle("");
            setQuery("");
            setPrice("");
            setQuantity("1");
            setKind("sealed");
            setGraded(false);
            setGrade("");
            onAdded();
        } catch (err) {
            setError(err?.message || "Could not add the listing.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="contact-form mkt-add-form" onSubmit={submit}>
            <div className="lf-game-toggle" role="group" aria-label="Filter catalog by game">
                {games.map((g) => (
                    <button
                        key={g.id || "all"}
                        type="button"
                        className={`pill${game === g.id ? " lf-game-active" : ""}`}
                        onClick={() => setGame(g.id)}
                    >
                        {g.label}
                    </button>
                ))}
            </div>

            <label htmlFor="add-search">Search by name, set, or card number</label>
            <input
                id="add-search"
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                }}
                placeholder="e.g. Charizard Obsidian 125"
                autoComplete="off"
            />
            <p className="mkt-search-hint">Tip: combine words to narrow — name + set + collector number.</p>

            {selected ? (
                <div className="mkt-selected">
                    <div className="mkt-selected-head">
                        {selected.imageUrl ? (
                            <Image src={selected.imageUrl} alt="" width={56} height={78} className="mkt-picker-thumb" />
                        ) : (
                            <span className="mkt-picker-thumb mkt-picker-thumb-empty" aria-hidden="true" />
                        )}
                        <span className="mkt-selected-info">
                            <strong>{selected.name || "Custom item"}</strong>
                            <span className="mkt-picker-meta">
                                {selected.setName || "Not in catalog"}
                                {selected.marketPrice != null ? ` · mkt ${formatPrice(selected.marketPrice)}` : ""}
                            </span>
                        </span>
                        <button type="button" className="pill" onClick={() => setSelected(null)}>
                            Change
                        </button>
                    </div>

                    <label htmlFor="add-title">Listing title</label>
                    <input id="add-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />

                    <div className="mkt-toggle-row" role="group" aria-label="Listing type">
                        <button type="button" className={`pill${kind === "sealed" ? " lf-game-active" : ""}`} onClick={() => setKind("sealed")}>
                            Sealed
                        </button>
                        <button type="button" className={`pill${kind === "single" ? " lf-game-active" : ""}`} onClick={() => setKind("single")}>
                            Single
                        </button>
                    </div>

                    {kind === "single" ? (
                        <>
                            <div className="mkt-toggle-row" role="group" aria-label="Graded or raw">
                                <button type="button" className={`pill${!graded ? " lf-game-active" : ""}`} onClick={() => setGraded(false)}>
                                    Raw
                                </button>
                                <button type="button" className={`pill${graded ? " lf-game-active" : ""}`} onClick={() => setGraded(true)}>
                                    Graded
                                </button>
                            </div>
                            {graded ? (
                                <>
                                    <label htmlFor="add-grader">Grading company</label>
                                    <select id="add-grader" className="lf-set-select" value={gradingCompany} onChange={(e) => setGradingCompany(e.target.value)}>
                                        {GRADERS.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                    <label htmlFor="add-grade">Grade</label>
                                    <input id="add-grade" type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 10" />
                                </>
                            ) : (
                                <>
                                    <label htmlFor="add-condition">Condition</label>
                                    <select id="add-condition" className="lf-set-select" value={condition} onChange={(e) => setCondition(e.target.value)}>
                                        {CONDITIONS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
                        </>
                    ) : null}

                    <label htmlFor="add-language">Language</label>
                    <select id="add-language" className="lf-set-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        {LANGUAGES.map((l) => (
                            <option key={l} value={l}>
                                {l}
                            </option>
                        ))}
                    </select>

                    {(() => {
                        const market = pricing?.marketPrice ?? selected?.marketPrice ?? null;
                        const lowest = pricing?.lowestPrice ?? null;
                        const round2 = (n) => Math.round(n * 100) / 100;
                        const preview =
                            autoMode === "market_pct" && market != null
                                ? Math.max(0, round2(market * (Number(pctInput) / 100)))
                                : autoMode === "match_lowest" && (lowest ?? market) != null
                                  ? Math.max(0, round2((lowest ?? market) - (Number(undercutInput) || 0)))
                                  : null;
                        return (
                            <div className="mkt-pricing">
                                <div className="mkt-toggle-row" role="group" aria-label="Pricing mode">
                                    {[["manual", "Manual"], ["market_pct", "% of market"], ["match_lowest", "Match lowest"]].map(([m, lbl]) => (
                                        <button
                                            key={m}
                                            type="button"
                                            className={`pill${autoMode === m ? " lf-game-active" : ""}`}
                                            onClick={() => setAutoMode(m)}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>

                                {market != null || lowest != null ? (
                                    <p className="mkt-price-helper-label">
                                        {market != null ? `Market ${formatPrice(market)}` : ""}
                                        {lowest != null ? `${market != null ? " · " : ""}Lowest ${formatPrice(lowest)}${pricing?.vendorCount ? ` (${pricing.vendorCount})` : ""}` : ""}
                                    </p>
                                ) : null}

                                {autoMode === "manual" ? (
                                    <>
                                        {market != null ? (
                                            <div className="mkt-price-helper-row">
                                                {[0.85, 0.9, 0.95, 1].map((pct) => (
                                                    <button key={pct} type="button" className="pill" onClick={() => setPrice((market * pct).toFixed(2))}>
                                                        {Math.round(pct * 100)}%
                                                    </button>
                                                ))}
                                                {lowest != null ? (
                                                    <>
                                                        <button type="button" className="pill" onClick={() => setPrice(lowest.toFixed(2))}>Match</button>
                                                        <button type="button" className="pill" onClick={() => setPrice(Math.max(0, lowest - 0.25).toFixed(2))}>Undercut</button>
                                                    </>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <div className="mkt-add-row">
                                            <div>
                                                <label htmlFor="add-price">Your price ($)</label>
                                                <input id="add-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                                            </div>
                                            <div>
                                                <label htmlFor="add-qty">Quantity</label>
                                                <input id="add-qty" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="mkt-add-row">
                                            <div>
                                                {autoMode === "market_pct" ? (
                                                    <>
                                                        <label htmlFor="add-pct">% of market</label>
                                                        <input id="add-pct" type="number" min="1" step="1" value={pctInput} onChange={(e) => setPctInput(e.target.value)} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <label htmlFor="add-undercut">Undercut lowest by ($)</label>
                                                        <input id="add-undercut" type="number" min="0" step="0.25" value={undercutInput} onChange={(e) => setUndercutInput(e.target.value)} />
                                                    </>
                                                )}
                                            </div>
                                            <div>
                                                <label htmlFor="add-qty">Quantity</label>
                                                <input id="add-qty" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                                            </div>
                                        </div>
                                        <p className="mkt-price-helper-label">
                                            Auto price → {preview != null ? formatPrice(preview) : "needs a catalog-matched product"}
                                            {autoMode === "match_lowest" && lowest == null && market != null ? " (no other vendors yet — uses market)" : ""}
                                        </p>
                                        <label className="mkt-checkbox">
                                            <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                                            Save as my default for new listings
                                        </label>
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    <button className="button primary" type="submit" disabled={busy}>
                        {busy ? "Adding..." : "Add listing"}
                    </button>
                    {error ? <p className="muted">{error}</p> : null}
                </div>
            ) : (
                <div className="mkt-pick-results">
                    {results.length > 0 ? (
                        <div className="mkt-pick-grid">
                            {results.map((r) => (
                                <button key={r.catalogProductId} type="button" className="mkt-card mkt-pick-card" onClick={() => pick(r)}>
                                    <div className="mkt-card-art">
                                        {r.imageUrl ? (
                                            <Image src={r.imageUrl} alt="" width={146} height={204} className="mkt-card-image" />
                                        ) : (
                                            <div className="mkt-card-image mkt-card-image-empty" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="mkt-card-body">
                                        <h3 className="mkt-card-name">{r.name}</h3>
                                        <p className="mkt-card-meta">
                                            {r.setName}
                                            {r.number ? ` · #${r.number}` : ""}
                                            {r.rarity ? ` · ${r.rarity}` : ""}
                                        </p>
                                        {r.marketPrice != null ? <p className="mkt-card-price">mkt {formatPrice(r.marketPrice)}</p> : null}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="muted">
                            {query.trim().length >= 2
                                ? "No matches — try a different search."
                                : "Search above to find a product to list."}
                        </p>
                    )}
                    <button type="button" className="mkt-link-btn" onClick={startManual}>
                        Can&apos;t find it? Add a custom listing →
                    </button>
                </div>
            )}
        </form>
    );
}

function ListingRow({ listing, onChanged }) {
    const [price, setPrice] = useState(String(listing.price ?? ""));
    const [quantity, setQuantity] = useState(String(listing.quantity ?? 1));
    const [mode, setMode] = useState(listing.pricingMode || "manual");
    const [pctVal, setPctVal] = useState(
        listing.pricingMode === "market_pct" && listing.pricingValue != null ? String(Math.round(listing.pricingValue * 100)) : "90"
    );
    const [undercutVal, setUndercutVal] = useState(
        listing.pricingMode === "match_lowest" && listing.pricingValue != null ? String(listing.pricingValue) : "0"
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const storedValInput =
        listing.pricingMode === "market_pct" && listing.pricingValue != null
            ? String(Math.round(listing.pricingValue * 100))
            : listing.pricingMode === "match_lowest" && listing.pricingValue != null
              ? String(listing.pricingValue)
              : "";
    const currentValInput = mode === "market_pct" ? pctVal : mode === "match_lowest" ? undercutVal : "";
    const pricingDirty = mode !== (listing.pricingMode || "manual") || (mode !== "manual" && currentValInput !== storedValInput);
    const dirty =
        price !== String(listing.price ?? "") || quantity !== String(listing.quantity ?? 1) || pricingDirty;

    async function save() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/listings/${listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                    mode === "manual"
                        ? { price: Number(price), quantity: Number(quantity), pricingMode: "manual", pricingValue: null }
                        : {
                              quantity: Number(quantity),
                              pricingMode: mode,
                              pricingValue: mode === "market_pct" ? Number(pctVal) / 100 : Number(undercutVal) || 0,
                          }
                ),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || "Could not save.");
            }
            onChanged();
        } catch (err) {
            setError(err?.message || "Could not save.");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/listings/${listing.id}`, { method: "DELETE" });
            if (!response.ok) {
                throw new Error("Could not delete.");
            }
            onChanged();
        } catch (err) {
            setError(err?.message || "Could not delete.");
            setBusy(false);
        }
    }

    async function markSold() {
        if (typeof window !== "undefined" && !window.confirm(`Mark "${listing.title}" as sold? This removes it from your storefront and adds to your completed-sales record.`)) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/listings/${listing.id}/sold`, { method: "POST" });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || "Could not mark sold.");
            }
            onChanged();
        } catch (err) {
            setError(err?.message || "Could not mark sold.");
            setBusy(false);
        }
    }

    return (
        <li className="mkt-admin-row">
            <div className="mkt-admin-info">
                <strong>{listing.title}</strong>
                <span className="mkt-offer-meta">
                    {listing.kind}
                    {listing.graded
                        ? ` · ${[listing.gradingCompany, listing.grade].filter(Boolean).join(" ")}`
                        : listing.condition
                          ? ` · ${listing.condition}`
                          : ""}
                    {listing.language && listing.language !== "English" ? ` · ${listing.language}` : ""}
                    {listing.setName ? ` · ${listing.setName}` : ""}
                    {listing.pricingMode && listing.pricingMode !== "manual"
                        ? ` · auto ${listing.pricingMode === "market_pct" ? `${Math.round((listing.pricingValue || 0) * 100)}% mkt` : "match low"}`
                        : ""}
                </span>
                {error ? <span className="muted">{error}</span> : null}
            </div>
            <div className="mkt-admin-actions mkt-listing-edit">
                <select className="lf-set-select mkt-mode-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Pricing mode">
                    <option value="manual">Manual</option>
                    <option value="market_pct">% market</option>
                    <option value="match_lowest">Match low</option>
                </select>
                {mode === "manual" ? (
                    <label>
                        $
                        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                    </label>
                ) : mode === "market_pct" ? (
                    <label>
                        %
                        <input type="number" min="1" step="1" value={pctVal} onChange={(e) => setPctVal(e.target.value)} />
                    </label>
                ) : (
                    <label>
                        −$
                        <input type="number" min="0" step="0.25" value={undercutVal} onChange={(e) => setUndercutVal(e.target.value)} />
                    </label>
                )}
                <label>
                    Qty
                    <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </label>
                <button type="button" className="button primary" disabled={busy || !dirty} onClick={save}>
                    Save
                </button>
                <button type="button" className="pill mkt-sold-btn" disabled={busy} onClick={markSold}>
                    Mark sold
                </button>
                <button type="button" className="pill" disabled={busy} onClick={remove}>
                    Delete
                </button>
            </div>
        </li>
    );
}

function RequestRow({ request, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function setStatus(status) {
        if (
            status === "sold" &&
            typeof window !== "undefined" &&
            !window.confirm("Mark this lead as sold? If the item is still listed, it'll be closed out and recorded as a completed sale.")
        ) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/requests/${request.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || "Could not update.");
            }
            onChanged();
        } catch (err) {
            setError(err?.message || "Could not update.");
            setBusy(false);
        }
    }

    const terminal = request.status === "sold" || request.status === "closed";

    return (
        <li className={`mkt-admin-row mkt-request-row mkt-request-${request.status}`}>
            <div className="mkt-admin-info">
                <strong>
                    {request.itemTitle || "Listing"}
                    <span className={`mkt-request-badge mkt-request-badge-${request.status}`}>
                        {REQUEST_STATUS_LABELS[request.status] || request.status}
                    </span>
                </strong>
                <span className="mkt-offer-meta">
                    {request.buyerName ? `${request.buyerName} · ` : ""}
                    <a href={`mailto:${request.buyerEmail}`}>{request.buyerEmail}</a>
                    {request.createdAt ? ` · ${timeAgo(request.createdAt)}` : ""}
                </span>
                {request.message ? <span className="mkt-request-message">“{request.message}”</span> : null}
                {error ? <span className="muted">{error}</span> : null}
            </div>
            {!terminal ? (
                <div className="mkt-admin-actions">
                    {request.status !== "responded" ? (
                        <button type="button" className="pill" disabled={busy} onClick={() => setStatus("responded")}>
                            Mark replied
                        </button>
                    ) : null}
                    <button type="button" className="pill mkt-sold-btn" disabled={busy} onClick={() => setStatus("sold")}>
                        Mark sold
                    </button>
                    <button type="button" className="pill" disabled={busy} onClick={() => setStatus("closed")}>
                        Close
                    </button>
                </div>
            ) : null}
        </li>
    );
}

export default function VendorPortalClient({
    vendor,
    listings,
    wanted = [],
    salesCount = 0,
    requests = [],
    requestStats = null,
    sellOffers = [],
}) {
    const router = useRouter();
    const refresh = () => router.refresh();

    async function logout() {
        await fetch("/api/marketplace/vendor/logout", { method: "POST" });
        router.refresh();
    }

    // Open leads need action; sold/closed go into a collapsible history.
    const openRequests = requests.filter((r) => r.status === "new" || r.status === "responded");
    const closedRequests = requests.filter((r) => r.status === "sold" || r.status === "closed");

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <div className="mkt-admin-head">
                    <div>
                        <h1>Your Storefront</h1>
                        <p className="muted">
                            {vendor.displayName}{vendor.locationLabel ? ` · ${vendor.locationLabel}` : ""}
                            {salesCount > 0 ? ` · ${salesCount} completed sale${salesCount === 1 ? "" : "s"}` : ""}
                            {requestStats?.total > 0
                                ? ` · ${requestStats.total} lead${requestStats.total === 1 ? "" : "s"} (${requestStats.sold} sold)`
                                : ""}
                        </p>
                    </div>
                    <button type="button" className="pill" onClick={logout}>
                        Sign out
                    </button>
                </div>
            </section>

            {openRequests.length > 0 ? (
                <section className="card">
                    <h2>Inbound requests</h2>
                    <p className="muted">
                        Buyers who messaged you. Reply from your email, then mark what happened so it counts toward
                        your track record.
                    </p>
                    <ul className="mkt-admin-list">
                        {openRequests.map((request) => (
                            <RequestRow key={request.id} request={request} onChanged={refresh} />
                        ))}
                    </ul>
                    {closedRequests.length > 0 ? (
                        <details className="mkt-collapse mkt-request-history">
                            <summary className="mkt-collapse-summary">
                                <span>History ({closedRequests.length})</span>
                            </summary>
                            <ul className="mkt-admin-list mkt-collapse-body">
                                {closedRequests.map((request) => (
                                    <RequestRow key={request.id} request={request} onChanged={refresh} />
                                ))}
                            </ul>
                        </details>
                    ) : null}
                </section>
            ) : null}

            {wanted.length > 0 ? (
                <section className="card">
                    <h2>Most wanted by buyers</h2>
                    <p className="muted">What shoppers are asking for right now — a shopping list of what to stock.</p>
                    <ul className="mkt-admin-list mkt-wanted-list">
                        {wanted.map((w) => (
                            <li key={w.catalogProductId} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{w.name}</strong>
                                    <span className="mkt-offer-meta">
                                        {w.setName}
                                        {w.number ? ` · #${w.number}` : ""}
                                        {w.marketPrice != null ? ` · mkt ${formatPrice(w.marketPrice)}` : ""}
                                    </span>
                                </div>
                                <span className="shop-qty-badge">
                                    {w.wantCount} want{w.wantCount === 1 ? "" : "s"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {sellOffers.length > 0 ? (
                <section className="card">
                    <h2>Sellers looking for offers</h2>
                    <p className="muted">
                        Local sellers posted these to get offers. Email them directly to make an offer — they&apos;re
                        expecting to hear from vendors.
                    </p>
                    <ul className="mkt-admin-list">
                        {sellOffers.map((offer) => (
                            <li key={offer.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{offer.items}</strong>
                                    <span className="mkt-offer-meta">
                                        {offer.name ? `${offer.name} · ` : ""}
                                        <a href={`mailto:${offer.email}`}>{offer.email}</a>
                                        {offer.phone ? ` · ${offer.phone}` : ""}
                                        {offer.askingPrice ? ` · asking ${offer.askingPrice}` : ""}
                                        {offer.createdAt ? ` · ${timeAgo(offer.createdAt)}` : ""}
                                    </span>
                                </div>
                                <a className="button primary" href={`mailto:${offer.email}?subject=${encodeURIComponent("Offer on your cards — The Wolf Den Marketplace")}`}>
                                    Make offer
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="card">
                <h2>Add a listing</h2>
                <AddListingForm
                    onAdded={refresh}
                    defaultPricingMode={vendor.defaultPricingMode}
                    defaultPricingValue={vendor.defaultPricingValue}
                />
            </section>

            <section className="card">
                <details className="mkt-collapse">
                    <summary className="mkt-collapse-summary">
                        <h2>Bulk import from CSV</h2>
                    </summary>
                    <div className="mkt-collapse-body">
                        <VendorImportClient onImported={refresh} />
                    </div>
                </details>
            </section>

            <section className="card">
                <h2>Your listings{listings.length ? ` (${listings.length})` : ""}</h2>
                {listings.length === 0 ? (
                    <p className="muted">No listings yet. Add your first one above.</p>
                ) : (
                    <ul className="mkt-admin-list">
                        {listings.map((listing) => (
                            <ListingRow key={listing.id} listing={listing} onChanged={refresh} />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
