"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const DEFAULT_GAMES = [{ id: "", label: "All games" }];

const KINDS = [
    { id: "", label: "Everything" },
    { id: "sealed", label: "Sealed" },
    { id: "single", label: "Singles" },
];

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatPrice(value) {
    if (value === null || value === undefined) {
        return null;
    }

    return priceFormatter.format(Number(value));
}

function ResultTile({ item }) {
    const from = formatPrice(item.minPrice);
    const market = formatPrice(item.marketPrice);

    return (
        <Link href={`/marketplace/product/${item.catalogProductId}`} className="mkt-card">
            <div className="mkt-card-art">
                {item.imageUrl ? (
                    <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={146}
                        height={204}
                        sizes="146px"
                        className="mkt-card-image"
                    />
                ) : (
                    <div className="mkt-card-image mkt-card-image-empty" aria-hidden="true" />
                )}
            </div>
            <div className="mkt-card-body">
                <h3 className="mkt-card-name">{item.name}</h3>
                <p className="mkt-card-meta">
                    {item.setName}
                    {item.number ? ` · #${item.number}` : ""}
                </p>
                {from ? <p className="mkt-card-price">from {from}</p> : null}
                {market ? <p className="mkt-card-market">Market {market}</p> : null}
                <p className="mkt-card-sub">
                    {item.vendorCount} vendor{item.vendorCount === 1 ? "" : "s"}
                </p>
            </div>
        </Link>
    );
}

export default function MarketplaceSearchClient() {
    const [game, setGame] = useState("");
    const [kind, setKind] = useState("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState("");
    const [games, setGames] = useState(DEFAULT_GAMES);
    const [catalogResults, setCatalogResults] = useState([]);
    const abortRef = useRef(null);

    // Load the games that actually have catalog data (dynamic — grows as the sync widens).
    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/marketplace/games");
                const data = await response.json().catch(() => null);
                if (!ignore && response.ok && Array.isArray(data?.games)) {
                    setGames([{ id: "", label: "All games" }, ...data.games.map((g) => ({ id: g.slug, label: g.label }))]);
                }
            } catch {
                /* keep the default */
            }
        })();

        return () => {
            ignore = true;
        };
    }, []);

    // Debounced search. Empty query returns the most-stocked items so the grid is never blank.
    useEffect(() => {
        const trimmed = query.trim();

        const handle = setTimeout(async () => {
            if (abortRef.current) {
                abortRef.current.abort();
            }

            const controller = new AbortController();
            abortRef.current = controller;
            setSearching(true);

            try {
                const params = new URLSearchParams();
                if (trimmed) params.set("q", trimmed);
                if (game) params.set("game", game);
                if (kind) params.set("kind", kind);

                const response = await fetch(`/api/marketplace/search?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(data?.error || "Search failed.");
                }

                setResults(Array.isArray(data?.results) ? data.results : []);
                setError("");
            } catch (err) {
                if (err?.name !== "AbortError") {
                    setError("Search failed. Please try again.");
                    setResults([]);
                }
            } finally {
                setSearching(false);
            }
        }, trimmed.length === 0 ? 0 : 250);

        return () => clearTimeout(handle);
    }, [query, game, kind]);

    // Dead-end capture: when nobody stocks the search, look it up in the full catalog so the buyer
    // can ask to be notified when a vendor lists it.
    useEffect(() => {
        let ignore = false;

        // All state updates happen inside the deferred callback (never synchronously in the effect body).
        const handle = setTimeout(async () => {
            if (searching || results.length > 0 || query.trim().length < 2) {
                setCatalogResults([]);
                return;
            }

            try {
                const params = new URLSearchParams({ q: query.trim() });
                if (game) params.set("game", game);
                const response = await fetch(`/api/marketplace/catalog-search?${params.toString()}`, { cache: "no-store" });
                const data = await response.json().catch(() => null);
                if (!ignore && response.ok) {
                    setCatalogResults(Array.isArray(data?.results) ? data.results : []);
                }
            } catch {
                /* leave empty */
            }
        }, 150);

        return () => {
            ignore = true;
            clearTimeout(handle);
        };
    }, [results, query, game, searching]);

    const deadEnd = !searching && !error && results.length === 0 && query.trim().length >= 2;

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Find cards for sale near you</h1>
                <p>
                    Search sealed product and singles across every vetted local vendor — you only see what someone
                    actually has in stock. Pick an item to compare each vendor&apos;s price, then meet up in person.
                </p>
                <div className="mkt-hero-chips">
                    <span className="mkt-chip">✓ Hand-vetted vendors</span>
                    <span className="mkt-chip">📍 Local — meet in person</span>
                    <span className="mkt-chip">💬 Contact direct, no fees</span>
                </div>
                <p className="mkt-hero-links">
                    <Link href="/marketplace/vendors" className="pill">
                        📍 Browse vendors
                    </Link>
                    <Link href="/marketplace/wants" className="pill">
                        📋 Build a want list →
                    </Link>
                    <Link href="/marketplace/events" className="pill">
                        📅 Events near you →
                    </Link>
                    <Link href="/sell-cards" className="pill">
                        Got cards to sell? →
                    </Link>
                    <Link href="/marketplace/apply" className="pill">
                        Become a vendor →
                    </Link>
                </p>
            </section>

            <section className="card">
                <div className="mkt-filter-row">
                    <div className="mkt-filter-search">
                        <label className="lf-search-label" htmlFor="mkt-search">
                            Search the marketplace
                        </label>
                        <input
                            id="mkt-search"
                            className="lf-search-input"
                            type="search"
                            placeholder="e.g. Prismatic Evolutions, Charizard..."
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="mkt-filter-field">
                        <label className="lf-search-label" htmlFor="mkt-game">
                            Game
                        </label>
                        <select
                            id="mkt-game"
                            className="lf-set-select"
                            value={game}
                            onChange={(event) => setGame(event.target.value)}
                        >
                            {games.map((option) => (
                                <option key={option.id || "all"} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="mkt-filter-field">
                        <label className="lf-search-label" htmlFor="mkt-kind">
                            Type
                        </label>
                        <select
                            id="mkt-kind"
                            className="lf-set-select"
                            value={kind}
                            onChange={(event) => setKind(event.target.value)}
                        >
                            {KINDS.map((option) => (
                                <option key={option.id || "all"} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {searching ? <p className="muted">Searching...</p> : null}
                {error ? <p className="muted">{error}</p> : null}
                {!searching && !error && results.length === 0 && query.trim().length < 2 ? (
                    <p className="muted">No marketplace inventory yet.</p>
                ) : null}

                {deadEnd && catalogResults.length > 0 ? (
                    <div className="mkt-deadend">
                        <p className="muted">
                            No vendor has this in stock yet — tap a product and we&apos;ll email you the moment one
                            lists it.
                        </p>
                        <div className="mkt-grid">
                            {catalogResults.map((item) => (
                                <Link
                                    key={item.catalogProductId}
                                    href={`/marketplace/product/${item.catalogProductId}`}
                                    className="mkt-card"
                                >
                                    <div className="mkt-card-art">
                                        {item.imageUrl ? (
                                            <Image
                                                src={item.imageUrl}
                                                alt={item.name}
                                                width={146}
                                                height={204}
                                                sizes="146px"
                                                className="mkt-card-image"
                                            />
                                        ) : (
                                            <div className="mkt-card-image mkt-card-image-empty" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="mkt-card-body">
                                        <h3 className="mkt-card-name">{item.name}</h3>
                                        <p className="mkt-card-meta">
                                            {item.setName}
                                            {item.number ? ` · #${item.number}` : ""}
                                        </p>
                                        {item.marketPrice != null ? (
                                            <p className="mkt-card-market">Market {formatPrice(item.marketPrice)}</p>
                                        ) : null}
                                        <p className="mkt-card-sub">🔔 Notify me</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : null}

                {deadEnd && catalogResults.length === 0 ? (
                    <p className="muted">No match found. Try a different spelling.</p>
                ) : null}

                {results.length === 0 && !query.trim() ? (
                    <p className="muted mkt-idle">
                        Start typing a card, set, or product name above — or{" "}
                        <Link href="/marketplace/vendors">browse all vendors</Link>.
                    </p>
                ) : null}

                <div className="mkt-grid">
                    {results.map((item) => (
                        <ResultTile key={item.catalogProductId} item={item} />
                    ))}
                </div>
            </section>

            <section className="card">
                <h2>How it works</h2>
                <div className="mkt-how-grid">
                    <div className="mkt-how-step">
                        <span className="mkt-how-num">1</span>
                        <strong>Search</strong>
                        <p>Find the card or sealed product you want across every local vendor at once.</p>
                    </div>
                    <div className="mkt-how-step">
                        <span className="mkt-how-num">2</span>
                        <strong>Compare</strong>
                        <p>See who has it in stock, each vendor&apos;s price and condition, and where they are.</p>
                    </div>
                    <div className="mkt-how-step">
                        <span className="mkt-how-num">3</span>
                        <strong>Meet up</strong>
                        <p>Message the vendor and arrange to meet in person — often right at The Wolf Den.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
