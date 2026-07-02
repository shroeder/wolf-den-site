"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import VendorImportClient from "@/components/VendorImportClient";
import { VENDOR_SPECIALTIES } from "@/lib/marketplace/specialties.js";

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
    const [catalogType, setCatalogType] = useState("sealed");
    const [sets, setSets] = useState([]);
    const [setId, setSetId] = useState("");
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
    const [dealerAvailable, setDealerAvailable] = useState(false);
    const [wholesalePrice, setWholesalePrice] = useState("");
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

    // Load the set list whenever the game changes (for the optional set-browse dropdown). Reset of
    // sets/setId on game change happens in the game <select> handler to avoid sync setState here.
    useEffect(() => {
        if (!game) {
            return undefined;
        }
        let ignore = false;
        (async () => {
            try {
                const res = await fetch(`/api/marketplace/vendor/catalog-sets?game=${encodeURIComponent(game)}`, {
                    cache: "no-store",
                });
                const data = await res.json().catch(() => null);
                if (!ignore && res.ok) setSets(Array.isArray(data?.sets) ? data.sets : []);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            ignore = true;
        };
    }, [game]);

    useEffect(() => {
        const trimmed = query.trim();
        // Search needs text OR a chosen set to browse.
        const canSearch = trimmed.length >= 2 || Boolean(setId);

        // All state updates happen inside the deferred callback (never synchronously in the effect body).
        const handle = setTimeout(async () => {
            if (!canSearch || (selected && selected.name === trimmed)) {
                setResults([]);
                return;
            }

            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const params = new URLSearchParams();
                if (trimmed.length >= 2) params.set("q", trimmed);
                if (game) params.set("game", game);
                if (catalogType && catalogType !== "all") params.set("type", catalogType);
                if (setId) params.set("setId", setId);
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
    }, [query, game, catalogType, setId, selected]);

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
                    dealerAvailable,
                    wholesalePrice: dealerAvailable && wholesalePrice ? wholesalePrice : null,
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
            <label htmlFor="add-type">Type</label>
            <select
                id="add-type"
                className="mkt-game-select"
                value={catalogType}
                onChange={(event) => setCatalogType(event.target.value)}
            >
                <option value="sealed">Sealed (all)</option>
                <option value="single">Singles</option>
                <option value="tin">Tins</option>
                <option value="mini-tin">Mini Tins</option>
                <option value="etb">Elite Trainer Boxes</option>
                <option value="box">Booster Boxes</option>
                <option value="blister">Blisters</option>
                <option value="bundle">Bundles</option>
                <option value="pack">Booster Packs</option>
                <option value="all">All types</option>
            </select>

            <label htmlFor="add-game">Game (optional — narrows the search)</label>
            <select
                id="add-game"
                className="mkt-game-select"
                value={game}
                onChange={(event) => {
                    setGame(event.target.value);
                    setSetId("");
                    setSets([]);
                }}
            >
                {games.map((g) => (
                    <option key={g.id || "all"} value={g.id}>
                        {g.label}
                    </option>
                ))}
            </select>

            {game && sets.length > 0 ? (
                <>
                    <label htmlFor="add-set">Set (optional — pick one to browse it without typing)</label>
                    <select
                        id="add-set"
                        className="mkt-game-select"
                        value={setId}
                        onChange={(event) => setSetId(event.target.value)}
                    >
                        <option value="">All sets</option>
                        {sets.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </>
            ) : null}

            <label htmlFor="add-search">Search by name, set, or card number (optional if a set is chosen)</label>
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

                    <div className="mkt-dealer-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={dealerAvailable}
                                onChange={(e) => setDealerAvailable(e.target.checked)}
                            />{" "}
                            Also offer to other dealers (wholesale)
                        </label>
                        {dealerAvailable ? (
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={wholesalePrice}
                                onChange={(e) => setWholesalePrice(e.target.value)}
                                placeholder="wholesale $ (opt)"
                            />
                        ) : null}
                    </div>

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
    const [dealerAvailable, setDealerAvailable] = useState(Boolean(listing.dealerAvailable));
    const [wholesalePrice, setWholesalePrice] = useState(
        listing.wholesalePrice != null ? String(listing.wholesalePrice) : ""
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
    const dealerDirty =
        dealerAvailable !== Boolean(listing.dealerAvailable) ||
        wholesalePrice !== (listing.wholesalePrice != null ? String(listing.wholesalePrice) : "");
    const dirty =
        price !== String(listing.price ?? "") ||
        quantity !== String(listing.quantity ?? 1) ||
        pricingDirty ||
        dealerDirty;

    async function save() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/listings/${listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    quantity: Number(quantity),
                    dealerAvailable,
                    wholesalePrice: dealerAvailable && wholesalePrice ? wholesalePrice : null,
                    ...(mode === "manual"
                        ? { price: Number(price), pricingMode: "manual", pricingValue: null }
                        : {
                              pricingMode: mode,
                              pricingValue: mode === "market_pct" ? Number(pctVal) / 100 : Number(undercutVal) || 0,
                          }),
                }),
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
                <label title="Offer this to other dealers (wholesale)">
                    <input
                        type="checkbox"
                        checked={dealerAvailable}
                        onChange={(e) => setDealerAvailable(e.target.checked)}
                    />{" "}
                    Dealers
                </label>
                {dealerAvailable ? (
                    <label>
                        WS $
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wholesalePrice}
                            onChange={(e) => setWholesalePrice(e.target.value)}
                        />
                    </label>
                ) : null}
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

function VendorLogoEditor({ vendor, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function upload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        setBusy(true);
        setError("");
        try {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch("/api/marketplace/vendor/logo", { method: "POST", body });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Upload failed.");
            }
            onChanged();
        } catch (err) {
            setError(err?.message || "Upload failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mkt-logo-editor">
            {vendor.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vendor.logoUrl} alt={`${vendor.displayName} logo`} className="mkt-logo-preview" />
            ) : (
                <div className="mkt-logo-placeholder" aria-hidden="true">No logo yet</div>
            )}
            <label className="pill mkt-logo-upload">
                {busy ? "Uploading…" : vendor.logoUrl ? "Replace logo" : "Add logo"}
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={upload}
                    disabled={busy}
                    hidden
                />
            </label>
            {error ? <span className="muted">{error}</span> : null}
        </div>
    );
}

function DealerResult({ l, onOffered }) {
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState(l.wholesalePrice != null ? String(l.wholesalePrice) : "");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function makeOffer() {
        setBusy(true);
        setMsg("");
        try {
            const res = await fetch("/api/marketplace/vendor/offers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ listingId: l.id, kind: "buy", amount: amount || null, note: note || null }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Could not send offer.");
            setMsg("Offer sent — they'll get an email.");
            setOpen(false);
            onOffered();
        } catch (e) {
            setMsg(e?.message || "Could not send offer.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className="mkt-admin-row">
            <div className="mkt-admin-info">
                <strong>{l.title}</strong>
                <span className="mkt-offer-meta">
                    {l.setName ? `${l.setName} · ` : ""}
                    {l.condition || (l.graded ? `${l.gradingCompany || ""} ${l.grade || ""}`.trim() : "")}
                    {` · ${l.quantity} available`}
                    {` · ${formatPrice(l.wholesalePrice ?? l.price)}${l.wholesalePrice != null ? " wholesale" : ""}`}
                    {` · ${l.vendor.displayName}`}
                    {l.vendor.locationLabel ? ` (${l.vendor.locationLabel})` : ""}
                </span>
                {open ? (
                    <div className="mkt-want-add">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="your $ offer"
                        />
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="note (optional)"
                        />
                        <button type="button" className="pill" disabled={busy} onClick={makeOffer}>
                            Send offer
                        </button>
                    </div>
                ) : null}
                {msg ? <span className="muted">{msg}</span> : null}
            </div>
            <div className="mkt-dealer-actions">
                <button type="button" className="pill" onClick={() => setOpen((o) => !o)}>
                    {open ? "Cancel" : "Make offer"}
                </button>
                <Link href={`/marketplace/vendor/${l.vendor.id}`} className="pill">
                    Contact →
                </Link>
            </div>
        </li>
    );
}

function DealerNetwork({ onChanged, demand = [] }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);

    useEffect(() => {
        const t = setTimeout(async () => {
            const query = q.trim();
            if (query.length < 2) {
                setResults([]);
                return;
            }
            try {
                const res = await fetch(`/api/marketplace/vendor/dealer-inventory?q=${encodeURIComponent(query)}`, {
                    cache: "no-store",
                });
                const data = await res.json().catch(() => null);
                if (res.ok) setResults(Array.isArray(data?.listings) ? data.listings : []);
            } catch {
                /* ignore */
            }
        }, 250);
        return () => clearTimeout(t);
    }, [q]);

    return (
        <section className="card">
            <h2>Dealer Network — source inventory</h2>
            {demand.length > 0 ? (
                <div className="mkt-dealer-demand">
                    <h3 className="mkt-mission-head">🔥 Your dealer stock buyers want</h3>
                    <ul className="mkt-admin-list">
                        {demand.map((d) => (
                            <li key={d.listingId} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{d.title}</strong>
                                    <span className="mkt-offer-meta">
                                        {d.setName ? `${d.setName} · ` : ""}
                                        {d.quantity} in stock · {d.wantCount} buyer{d.wantCount === 1 ? "" : "s"} want it
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            <p className="muted">
                Search stock other vendors have opened to dealers, and make an offer to buy or swap. (Mark your
                own listings &quot;offer to other dealers&quot; to appear here for others.)
            </p>
            <input
                type="text"
                className="shop-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search dealer inventory (e.g. Surging Sparks ETB)"
            />
            {results.length > 0 ? (
                <ul className="mkt-admin-list">
                    {results.map((l) => (
                        <DealerResult key={l.id} l={l} onOffered={onChanged} />
                    ))}
                </ul>
            ) : q.trim().length >= 2 ? (
                <p className="muted">No dealer stock matches — try another search.</p>
            ) : null}
        </section>
    );
}

function DealerOffers({ dealerOffers, onChanged }) {
    const incoming = dealerOffers?.incoming || [];
    const outgoing = dealerOffers?.outgoing || [];
    if (incoming.length === 0 && outgoing.length === 0) {
        return null;
    }

    async function respond(id, action) {
        try {
            await fetch(`/api/marketplace/vendor/offers/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action }),
            });
            onChanged();
        } catch {
            /* ignore */
        }
    }

    const terms = (o) => (o.kind === "trade" ? "trade" : o.amount != null ? formatPrice(o.amount) : "offer");

    return (
        <section className="card">
            <h2>Dealer offers</h2>
            {incoming.length > 0 ? (
                <>
                    <h3 className="mkt-mission-head">On your listings</h3>
                    <ul className="mkt-admin-list">
                        {incoming.map((o) => (
                            <li key={o.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{o.listingTitle}</strong>
                                    <span className="mkt-offer-meta">
                                        {o.counterpartyName} · {terms(o)}
                                        {o.quantity > 1 ? ` · qty ${o.quantity}` : ""}
                                        {o.note ? ` · "${o.note}"` : ""} · {o.status}
                                    </span>
                                </div>
                                {o.status === "pending" ? (
                                    <div className="mkt-dealer-actions">
                                        <button type="button" className="button primary" onClick={() => respond(o.id, "accept")}>
                                            Accept
                                        </button>
                                        <button type="button" className="pill" onClick={() => respond(o.id, "decline")}>
                                            Decline
                                        </button>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
            {outgoing.length > 0 ? (
                <>
                    <h3 className="mkt-mission-head">You made</h3>
                    <ul className="mkt-admin-list">
                        {outgoing.map((o) => (
                            <li key={o.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{o.listingTitle}</strong>
                                    <span className="mkt-offer-meta">
                                        to {o.counterpartyName} · {terms(o)} · {o.status}
                                    </span>
                                </div>
                                {o.status === "pending" ? (
                                    <button type="button" className="pill" onClick={() => respond(o.id, "withdraw")}>
                                        Withdraw
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
        </section>
    );
}

function VendorSpecialtiesEditor({ vendor, onChanged }) {
    const [selected, setSelected] = useState(new Set(vendor.specialties || []));
    const [saving, setSaving] = useState(false);

    async function toggle(tag) {
        const next = new Set(selected);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        setSelected(next);
        setSaving(true);
        try {
            await fetch("/api/marketplace/vendor/specialties", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ specialties: Array.from(next) }),
            });
            onChanged();
        } catch {
            /* ignore */
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mkt-specialties-editor">
            <span className="muted">Specialties (what you&apos;re known for):</span>
            <div className="mkt-specialties-tags">
                {VENDOR_SPECIALTIES.map((tag) => (
                    <button
                        key={tag}
                        type="button"
                        className={`pill${selected.has(tag) ? " lf-game-active" : ""}`}
                        disabled={saving}
                        onClick={() => toggle(tag)}
                    >
                        {tag}
                    </button>
                ))}
            </div>
        </div>
    );
}

function VendorFulfillmentEditor({ vendor, onChanged }) {
    const [ships, setShips] = useState(Boolean(vendor.ships));
    const [localPickup, setLocalPickup] = useState(vendor.localPickup !== false);
    const [saving, setSaving] = useState(false);

    async function save(next) {
        setSaving(true);
        try {
            await fetch("/api/marketplace/vendor/fulfillment", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(next),
            });
            onChanged();
        } catch {
            /* ignore */
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mkt-fulfillment">
            <span className="muted">Buyers can:</span>
            <label>
                <input
                    type="checkbox"
                    checked={localPickup}
                    disabled={saving}
                    onChange={(e) => {
                        setLocalPickup(e.target.checked);
                        save({ ships, localPickup: e.target.checked });
                    }}
                />{" "}
                Local pickup
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={ships}
                    disabled={saving}
                    onChange={(e) => {
                        setShips(e.target.checked);
                        save({ ships: e.target.checked, localPickup });
                    }}
                />{" "}
                Ship
            </label>
        </div>
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
    missions = { demandGaps: [], uniques: [] },
    dealerOffers = { incoming: [], outgoing: [] },
    dealerDemand = [],
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
                        <VendorLogoEditor vendor={vendor} onChanged={refresh} />
                        <VendorFulfillmentEditor vendor={vendor} onChanged={refresh} />
                        <VendorSpecialtiesEditor vendor={vendor} onChanged={refresh} />
                    </div>
                    <button type="button" className="pill" onClick={logout}>
                        Sign out
                    </button>
                </div>
            </section>

            <section className="card">
                <h2>Vendor Missions</h2>
                <p className="muted">
                    Opportunities from the network — what to stock next, and where you&apos;re the only seller.
                    Have dead stock?{" "}
                    <Link href="/marketplace" className="mkt-mission-source">
                        Source &amp; sell to other vendors →
                    </Link>
                </p>
                {missions.demandGaps.length === 0 && missions.uniques.length === 0 ? (
                    <p className="muted">
                        No opportunities yet. As buyers hit &quot;notify me&quot; on cards and vendors list
                        inventory, this panel surfaces what to buy/list next and where you&apos;re the only seller.
                    </p>
                ) : null}
                {missions.demandGaps.length > 0 ? (
                    <>
                        <h3 className="mkt-mission-head">📈 Buyers want these — you don&apos;t list them</h3>
                        <ul className="mkt-mission-grid">
                            {missions.demandGaps.map((m) => (
                                <li key={m.catalogProductId} className="mkt-mission-card">
                                    {m.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.imageUrl} alt="" className="mkt-mission-img" />
                                    ) : null}
                                    <div>
                                        <strong>{m.name}</strong>
                                        <p className="mkt-offer-meta">{m.setName}</p>
                                        <p className="mkt-mission-signal">
                                            {m.wantCount} buyer{m.wantCount === 1 ? "" : "s"} want this ·{" "}
                                            {m.sellerCount === 0
                                                ? "nobody in the network stocks it yet"
                                                : `${m.sellerCount} seller${m.sellerCount === 1 ? "" : "s"} carry it`}
                                        </p>
                                        {m.sellerCount > 0 ? (
                                            <Link
                                                href={`/marketplace/product/${m.catalogProductId}`}
                                                className="mkt-mission-source"
                                            >
                                                🔁 Source it from {m.sellerCount} vendor{m.sellerCount === 1 ? "" : "s"} →
                                            </Link>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}
                {missions.uniques.length > 0 ? (
                    <>
                        <h3 className="mkt-mission-head">⭐ You&apos;re the only seller</h3>
                        <ul className="mkt-mission-grid">
                            {missions.uniques.map((m) => (
                                <li key={m.catalogProductId} className="mkt-mission-card">
                                    {m.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.imageUrl} alt="" className="mkt-mission-img" />
                                    ) : null}
                                    <div>
                                        <strong>{m.name}</strong>
                                        <p className="mkt-offer-meta">{m.setName}</p>
                                        <p className="mkt-mission-signal">
                                            Only copy in the network{m.wantCount > 0 ? ` · ${m.wantCount} want it` : ""}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}
            </section>

            <DealerOffers dealerOffers={dealerOffers} onChanged={refresh} />

            <DealerNetwork onChanged={refresh} demand={dealerDemand} />

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
