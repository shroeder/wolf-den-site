"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const GAMES = [
    { id: "", label: "All games" },
    { id: "pokemon", label: "Pokemon" },
    { id: "magic", label: "Magic" },
];

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
    const abortRef = useRef(null);

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

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Vendor Marketplace</h1>
                <p>
                    Search sealed product and singles across every vetted vendor. You only see what someone actually
                    has in stock — pick an item to see each vendor&apos;s price and where they are.
                </p>
                <p className="mkt-hero-links">
                    <Link href="/marketplace/vendors" className="pill">
                        📍 Browse vendors near you
                    </Link>
                    <Link href="/marketplace/apply" className="pill">
                        Sell on the marketplace →
                    </Link>
                </p>
            </section>

            <section className="card">
                <div className="lf-game-toggle" role="group" aria-label="Filter by game">
                    {GAMES.map((option) => (
                        <button
                            key={option.id || "all"}
                            type="button"
                            className={`pill${game === option.id ? " lf-game-active" : ""}`}
                            onClick={() => setGame(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="mkt-toggle-row" role="group" aria-label="Filter by type">
                    {KINDS.map((option) => (
                        <button
                            key={option.id || "all"}
                            type="button"
                            className={`pill${kind === option.id ? " lf-game-active" : ""}`}
                            onClick={() => setKind(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="lf-search-row">
                    <div className="lf-search-field">
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
                </div>

                {searching ? <p className="muted">Searching...</p> : null}
                {error ? <p className="muted">{error}</p> : null}
                {!searching && !error && results.length === 0 ? (
                    <p className="muted">
                        {query.trim()
                            ? "No vendor has that in stock right now. Try a different search."
                            : "No marketplace inventory yet."}
                    </p>
                ) : null}

                <div className="mkt-grid">
                    {results.map((item) => (
                        <ResultTile key={item.catalogProductId} item={item} />
                    ))}
                </div>
            </section>
        </div>
    );
}
