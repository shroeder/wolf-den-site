"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const GAMES = [
    { id: "pokemon", label: "Pokemon" },
    { id: "magic", label: "Magic: The Gathering" },
];

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatPrice(value) {
    if (value === null || value === undefined) {
        return "Price unavailable";
    }

    return priceFormatter.format(Number(value));
}

function CardTile({ card, inList, busy, onAdd, onRemove }) {
    return (
        <article className="lf-card">
            <div className="lf-card-art">
                {card.imageUrl ? (
                    <Image
                        src={card.imageUrl}
                        alt={card.name}
                        width={146}
                        height={204}
                        sizes="146px"
                        className="lf-card-image"
                    />
                ) : (
                    <div className="lf-card-image lf-card-image-empty" aria-hidden="true" />
                )}
            </div>
            <div className="lf-card-body">
                <h3 className="lf-card-name">{card.name}</h3>
                <p className="lf-card-meta">
                    {card.setName}
                    {card.number ? ` · #${card.number}` : ""}
                </p>
                <p className="lf-card-price">{formatPrice(card.marketPrice)}</p>
            </div>
            {inList ? (
                <button type="button" className="pill" disabled={busy} onClick={() => onRemove(card.id)}>
                    Remove
                </button>
            ) : (
                <button type="button" className="button primary" disabled={busy} onClick={() => onAdd(card.id)}>
                    Add to list
                </button>
            )}
        </article>
    );
}

export default function LookingForClient() {
    const [game, setGame] = useState("pokemon");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");

    const [items, setItems] = useState([]);
    const [email, setEmail] = useState(null);
    const [emailVerified, setEmailVerified] = useState(false);
    const [pendingCardId, setPendingCardId] = useState(null);

    const [emailInput, setEmailInput] = useState("");
    const [emailSubmitting, setEmailSubmitting] = useState(false);
    const [emailMessage, setEmailMessage] = useState("");

    const searchParams = useSearchParams();
    const confirmBanner = useMemo(() => {
        const confirmed = searchParams.get("confirmed");

        if (confirmed === "1") {
            return "Your email is confirmed — alerts are on.";
        }

        if (confirmed === "invalid") {
            return "That confirmation link is invalid or expired. Re-enter your email to try again.";
        }

        return "";
    }, [searchParams]);

    const listIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
    const searchAbortRef = useRef(null);

    const applyListResponse = useCallback((data) => {
        setItems(Array.isArray(data?.items) ? data.items : []);
        setEmail(data?.email ?? null);
        setEmailVerified(Boolean(data?.emailVerified));
    }, []);

    // Load the persisted wishlist + email state on mount.
    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/looking-for/list", { cache: "no-store" });
                const data = await response.json().catch(() => null);

                if (!ignore && response.ok && data) {
                    applyListResponse(data);
                }
            } catch {
                // Non-fatal: the list simply starts empty.
            }
        })();

        return () => {
            ignore = true;
        };
    }, [applyListResponse]);

    // Debounced search whenever the query or game changes. All state updates happen inside the
    // timer callback (never synchronously in the effect body) to avoid cascading renders.
    useEffect(() => {
        const trimmed = query.trim();

        const handle = setTimeout(async () => {
            if (trimmed.length < 2) {
                setResults([]);
                setSearching(false);
                setSearchError("");
                return;
            }

            if (searchAbortRef.current) {
                searchAbortRef.current.abort();
            }

            const controller = new AbortController();
            searchAbortRef.current = controller;
            setSearching(true);

            try {
                const params = new URLSearchParams({ game, q: trimmed });
                const response = await fetch(`/api/looking-for/search?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(data?.error || "Search failed.");
                }

                setResults(Array.isArray(data?.results) ? data.results : []);
                setSearchError("");
            } catch (error) {
                if (error?.name !== "AbortError") {
                    setSearchError("Search failed. Please try again.");
                    setResults([]);
                }
            } finally {
                setSearching(false);
            }
        }, trimmed.length < 2 ? 0 : 300);

        return () => clearTimeout(handle);
    }, [query, game]);

    const addCard = useCallback(async (cardId) => {
        setPendingCardId(cardId);

        try {
            const response = await fetch("/api/looking-for/list", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ cardId }),
            });
            const data = await response.json().catch(() => null);

            if (response.ok && data) {
                applyListResponse(data);
            }
        } finally {
            setPendingCardId(null);
        }
    }, [applyListResponse]);

    const removeCard = useCallback(async (cardId) => {
        setPendingCardId(cardId);

        try {
            const response = await fetch(`/api/looking-for/list?cardId=${cardId}`, { method: "DELETE" });
            const data = await response.json().catch(() => null);

            if (response.ok && data) {
                applyListResponse(data);
            }
        } finally {
            setPendingCardId(null);
        }
    }, [applyListResponse]);

    async function submitEmail(event) {
        event.preventDefault();
        setEmailSubmitting(true);
        setEmailMessage("");

        try {
            const response = await fetch("/api/looking-for/email", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: emailInput }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not save your email.");
            }

            setEmail(data.email);
            setEmailVerified(false);
            setEmailInput("");
            setEmailMessage(data.message || "Check your inbox to confirm.");
        } catch (error) {
            setEmailMessage(error?.message || "Could not save your email.");
        } finally {
            setEmailSubmitting(false);
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Looking For a Card?</h1>
                <p>
                    Search our Magic: The Gathering and Pokemon catalog, build a list of the cards you want, and
                    we&apos;ll email you when they land in the shop. Your list is saved on this device automatically.
                </p>
                {confirmBanner ? <p className="statement-copy">{confirmBanner}</p> : null}
            </section>

            <section className="card">
                <div className="lf-game-toggle" role="tablist" aria-label="Choose a game">
                    {GAMES.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="tab"
                            aria-selected={game === option.id}
                            className={`pill${game === option.id ? " lf-game-active" : ""}`}
                            onClick={() => setGame(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <label className="lf-search-label" htmlFor="lf-search">
                    Search {game === "magic" ? "Magic" : "Pokemon"} cards by name
                </label>
                <input
                    id="lf-search"
                    className="lf-search-input"
                    type="search"
                    placeholder="e.g. Charizard, Sol Ring..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                />

                {searching ? <p className="muted">Searching...</p> : null}
                {searchError ? <p className="muted">{searchError}</p> : null}
                {!searching && !searchError && query.trim().length >= 2 && results.length === 0 ? (
                    <p className="muted">No matches found. Try a different spelling.</p>
                ) : null}

                <div className="lf-grid">
                    {results.map((card) => (
                        <CardTile
                            key={card.id}
                            card={card}
                            inList={listIds.has(card.id)}
                            busy={pendingCardId === card.id}
                            onAdd={addCard}
                            onRemove={removeCard}
                        />
                    ))}
                </div>
            </section>

            <section className="card">
                <h2>My List{items.length ? ` (${items.length})` : ""}</h2>
                {items.length === 0 ? (
                    <p className="muted">Nothing here yet. Search above and add the cards you&apos;re hunting for.</p>
                ) : (
                    <div className="lf-grid">
                        {items.map((card) => (
                            <CardTile
                                key={card.id}
                                card={card}
                                inList
                                busy={pendingCardId === card.id}
                                onAdd={addCard}
                                onRemove={removeCard}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section className="card">
                <h2>Get an email when we get your cards</h2>
                {emailVerified ? (
                    <p className="statement-copy">
                        Alerts are on for <strong>{email}</strong>. We&apos;ll email you when a card on your list comes
                        into the shop.
                    </p>
                ) : (
                    <>
                        <p>
                            Add your email and we&apos;ll send a one-click confirmation. After you confirm, you&apos;ll
                            get an alert whenever a card on your list shows up in our inventory.
                        </p>
                        {email ? (
                            <p className="muted">
                                Pending confirmation for <strong>{email}</strong>. Check your inbox for the confirmation
                                link.
                            </p>
                        ) : null}
                        <form className="contact-form" onSubmit={submitEmail}>
                            <label htmlFor="lf-email">Email</label>
                            <input
                                id="lf-email"
                                type="email"
                                value={emailInput}
                                onChange={(event) => setEmailInput(event.target.value)}
                                placeholder="you@example.com"
                                required
                            />
                            <button className="button primary" type="submit" disabled={emailSubmitting}>
                                {emailSubmitting ? "Sending..." : email ? "Resend confirmation" : "Turn on alerts"}
                            </button>
                        </form>
                    </>
                )}
                {emailMessage ? <p className="statement-copy">{emailMessage}</p> : null}
            </section>
        </div>
    );
}
