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

const MAX_QUANTITY = 99;

function QtyStepper({ quantity, busy, onChange }) {
    return (
        <div className="lf-qty" role="group" aria-label="Quantity wanted">
            <button
                type="button"
                className="lf-qty-btn"
                disabled={busy || quantity <= 1}
                onClick={() => onChange(quantity - 1)}
                aria-label="Want one fewer"
            >
                −
            </button>
            <span className="lf-qty-value" aria-live="polite">
                {quantity}
            </span>
            <button
                type="button"
                className="lf-qty-btn"
                disabled={busy || quantity >= MAX_QUANTITY}
                onClick={() => onChange(quantity + 1)}
                aria-label="Want one more"
            >
                +
            </button>
        </div>
    );
}

function CardTile({ card, inList, quantity, busy, onAdd, onRemove, onQuantityChange }) {
    const inStock = card.stockQuantity > 0;

    return (
        <article className={`lf-card${inStock ? " lf-card-instock" : ""}`}>
            <div className="lf-card-art">
                {inStock ? (
                    <span className="lf-instock-badge">
                        {card.stockQuantity} in stock
                    </span>
                ) : null}
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
                <div className="lf-card-actions">
                    <QtyStepper
                        quantity={quantity}
                        busy={busy}
                        onChange={(next) => onQuantityChange(card.id, next)}
                    />
                    <button type="button" className="pill" disabled={busy} onClick={() => onRemove(card.id)}>
                        Remove
                    </button>
                </div>
            ) : (
                <button type="button" className="button primary" disabled={busy} onClick={() => onAdd(card.id)}>
                    Add to list
                </button>
            )}
        </article>
    );
}

function EmailCapture({ idSuffix, email, emailVerified, emailInput, onChange, submitting, message, onSubmit, compact }) {
    if (emailVerified) {
        return (
            <p className="statement-copy">
                Alerts are on for <strong>{email}</strong>. We&apos;ll email you the moment a card on your list comes
                into the shop.
            </p>
        );
    }

    return (
        <>
            <p>
                {compact
                    ? "Get an email the moment we get a card on your list — add your address to turn on alerts."
                    : "Add your email and we'll send a one-click confirmation. After you confirm, you'll get an alert whenever a card on your list shows up in our inventory."}
            </p>
            {email ? (
                <p className="muted">
                    Pending confirmation for <strong>{email}</strong>. Check your inbox for the link.
                </p>
            ) : null}
            <form className="contact-form" onSubmit={onSubmit}>
                <label htmlFor={`lf-email-${idSuffix}`}>Email</label>
                <input
                    id={`lf-email-${idSuffix}`}
                    type="email"
                    value={emailInput}
                    onChange={onChange}
                    placeholder="you@example.com"
                    required
                />
                <button className="button primary" type="submit" disabled={submitting}>
                    {submitting ? "Sending..." : email ? "Resend confirmation" : "Turn on alerts"}
                </button>
            </form>
            {message ? <p className="statement-copy">{message}</p> : null}
        </>
    );
}

export default function LookingForClient() {
    const [game, setGame] = useState("pokemon");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [sets, setSets] = useState([]);
    const [selectedSetId, setSelectedSetId] = useState("");
    const [setFilterText, setSetFilterText] = useState("");

    const [items, setItems] = useState([]);
    const [email, setEmail] = useState(null);
    const [emailVerified, setEmailVerified] = useState(false);
    const [pendingCardId, setPendingCardId] = useState(null);

    const [emailInput, setEmailInput] = useState("");
    const [emailSubmitting, setEmailSubmitting] = useState(false);
    const [emailMessage, setEmailMessage] = useState("");
    const [listOpen, setListOpen] = useState(false);

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
    const quantityById = useMemo(
        () => new Map(items.map((item) => [item.id, item.quantity ?? 1])),
        [items]
    );
    const searchAbortRef = useRef(null);
    const autoOpenedRef = useRef(false);

    // Set options for the type-to-filter picker, plus a resolver from the typed/selected text
    // back to a set id (matches the full "Name (CODE)" label or just the set name).
    const setOptions = useMemo(
        () =>
            sets.map((set) => ({
                id: set.id,
                name: set.name,
                label: `${set.name}${set.code ? ` (${set.code})` : ""}`,
            })),
        [sets]
    );

    const resolveSetId = useCallback(
        (value) => {
            const trimmed = value.trim();

            if (!trimmed) {
                return "";
            }

            const match =
                setOptions.find((option) => option.label === trimmed) ||
                setOptions.find((option) => option.name.toLowerCase() === trimmed.toLowerCase());

            return match ? String(match.id) : "";
        },
        [setOptions]
    );

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

    // Load the set list for the "Browse by set" picker whenever the game changes.
    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch(`/api/looking-for/sets?game=${game}`, { cache: "no-store" });
                const data = await response.json().catch(() => null);

                if (!ignore && response.ok && Array.isArray(data?.sets)) {
                    setSets(data.sets);
                }
            } catch {
                // Non-fatal: the picker just stays empty.
            }
        })();

        return () => {
            ignore = true;
        };
    }, [game]);

    // Debounced search. A selected set browses that set; otherwise it's a card/featured query.
    // All state updates happen inside the timer callback (never synchronously in the effect body).
    useEffect(() => {
        const trimmed = query.trim();

        const handle = setTimeout(async () => {
            if (searchAbortRef.current) {
                searchAbortRef.current.abort();
            }

            const controller = new AbortController();
            searchAbortRef.current = controller;
            setSearching(true);

            try {
                // A set selection browses the whole set; an empty query returns featured cards, so
                // the grid is never blank.
                const params = selectedSetId
                    ? new URLSearchParams({ game, set: selectedSetId })
                    : new URLSearchParams({ game, q: trimmed });
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
        }, selectedSetId || trimmed.length < 2 ? 0 : 300);

        return () => clearTimeout(handle);
    }, [query, game, selectedSetId]);

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

                // First add of the session: open the list so they immediately see the alert
                // signup (skip if they've already turned alerts on).
                if (!autoOpenedRef.current && !data.emailVerified) {
                    setListOpen(true);
                    autoOpenedRef.current = true;
                }
            }
        } finally {
            setPendingCardId(null);
        }
    }, [applyListResponse]);

    const updateQuantity = useCallback(async (cardId, quantity) => {
        const next = Math.max(1, Math.min(MAX_QUANTITY, Math.trunc(quantity)));

        // Optimistic: reflect the new count immediately, then reconcile with the server response.
        setItems((prev) => prev.map((item) => (item.id === cardId ? { ...item, quantity: next } : item)));
        setPendingCardId(cardId);

        try {
            const response = await fetch("/api/looking-for/list", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ cardId, quantity: next }),
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

            <section className="card lf-alert-cta">
                <h2>Get an email when we get your cards</h2>
                <EmailCapture
                    idSuffix="page"
                    email={email}
                    emailVerified={emailVerified}
                    emailInput={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    submitting={emailSubmitting}
                    message={emailMessage}
                    onSubmit={submitEmail}
                />
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
                            onClick={() => {
                                setGame(option.id);
                                setSelectedSetId("");
                                setSetFilterText("");
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="lf-search-row">
                    <div className="lf-search-field">
                        <label className="lf-search-label" htmlFor="lf-search">
                            Search by card name
                        </label>
                        <input
                            id="lf-search"
                            className="lf-search-input"
                            type="search"
                            placeholder="e.g. Charizard, Sol Ring..."
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setSelectedSetId("");
                                setSetFilterText("");
                            }}
                            autoComplete="off"
                        />
                    </div>

                    <div className="lf-search-field">
                        <label className="lf-search-label" htmlFor="lf-set">
                            …or browse a set
                        </label>
                        <input
                            id="lf-set"
                            className="lf-set-select"
                            type="text"
                            list="lf-sets-list"
                            placeholder="Type to filter sets…"
                            value={setFilterText}
                            onChange={(event) => {
                                const value = event.target.value;
                                setSetFilterText(value);
                                setQuery("");
                                setSelectedSetId(resolveSetId(value));
                            }}
                            autoComplete="off"
                        />
                        <datalist id="lf-sets-list">
                            {setOptions.map((option) => (
                                <option key={option.id} value={option.label} />
                            ))}
                        </datalist>
                    </div>
                </div>

                {searching ? <p className="muted">Searching...</p> : null}
                {searchError ? <p className="muted">{searchError}</p> : null}
                {!searching && !searchError && selectedSetId && results.length > 0 ? (
                    <p className="muted">
                        Showing every card in{" "}
                        {sets.find((set) => String(set.id) === String(selectedSetId))?.name || "this set"}, in collector-number order.
                    </p>
                ) : null}
                {!searching && !searchError && !selectedSetId && query.trim().length < 2 && results.length > 0 ? (
                    <p className="muted">
                        Notable {game === "magic" ? "Magic" : "Pokemon"} cards to get you started — search by card name
                        above, or browse a whole set.
                    </p>
                ) : null}
                {!searching && !searchError && query.trim().length >= 2 && results.length === 0 ? (
                    <p className="muted">No matches found. Try a different spelling.</p>
                ) : null}

                <div className="lf-grid">
                    {results.map((card) => (
                        <CardTile
                            key={card.id}
                            card={card}
                            inList={listIds.has(card.id)}
                            quantity={quantityById.get(card.id) ?? 1}
                            busy={pendingCardId === card.id}
                            onAdd={addCard}
                            onRemove={removeCard}
                            onQuantityChange={updateQuantity}
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
                                quantity={card.quantity ?? 1}
                                busy={pendingCardId === card.id}
                                onAdd={addCard}
                                onRemove={removeCard}
                                onQuantityChange={updateQuantity}
                            />
                        ))}
                    </div>
                )}
            </section>

            <div className="lf-list-fab-wrap">
                {items.length > 0 && !emailVerified ? (
                    <button type="button" className="lf-list-hint" onClick={() => setListOpen(true)}>
                        🔔 Turn on alerts
                    </button>
                ) : null}
                <button
                    type="button"
                    className="lf-list-fab"
                    onClick={() => setListOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={listOpen}
                >
                    My List
                    <span className="lf-list-fab-count">{items.length}</span>
                </button>
            </div>

            {listOpen ? (
                <div
                    className="lf-drawer-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="My list"
                    onClick={() => setListOpen(false)}
                >
                    <div className="lf-drawer" onClick={(event) => event.stopPropagation()}>
                        <div className="lf-drawer-head">
                            <h2>My List{items.length ? ` (${items.length})` : ""}</h2>
                            <button type="button" className="pill" onClick={() => setListOpen(false)}>
                                Close
                            </button>
                        </div>
                        {items.length === 0 ? (
                            <p className="muted">
                                Nothing here yet. Search or browse a set, then tap &ldquo;Add to list.&rdquo;
                            </p>
                        ) : (
                            <>
                                <div className="lf-drawer-alerts">
                                    <h3>{emailVerified ? "Alerts are on" : "Get alerted when we get these"}</h3>
                                    <EmailCapture
                                        idSuffix="drawer"
                                        email={email}
                                        emailVerified={emailVerified}
                                        emailInput={emailInput}
                                        onChange={(event) => setEmailInput(event.target.value)}
                                        submitting={emailSubmitting}
                                        message={emailMessage}
                                        onSubmit={submitEmail}
                                        compact
                                    />
                                </div>
                                <ul className="lf-drawer-list">
                                {items.map((card) => (
                                    <li
                                        key={card.id}
                                        className={`lf-drawer-row${card.stockQuantity > 0 ? " lf-drawer-row-instock" : ""}`}
                                    >
                                        {card.imageUrl ? (
                                            <Image
                                                src={card.imageUrl}
                                                alt=""
                                                width={40}
                                                height={56}
                                                sizes="40px"
                                                className="lf-drawer-thumb"
                                            />
                                        ) : null}
                                        <div className="lf-drawer-info">
                                            <strong>{card.name}</strong>
                                            <span className="muted">
                                                {card.setName}
                                                {card.number ? ` · #${card.number}` : ""}
                                            </span>
                                            <span className="lf-card-price">
                                                {formatPrice(card.marketPrice)}
                                                {card.stockQuantity > 0 ? (
                                                    <span className="lf-drawer-instock-tag"> · {card.stockQuantity} in stock</span>
                                                ) : null}
                                            </span>
                                        </div>
                                        <div className="lf-drawer-actions">
                                            <QtyStepper
                                                quantity={card.quantity ?? 1}
                                                busy={pendingCardId === card.id}
                                                onChange={(next) => updateQuantity(card.id, next)}
                                            />
                                            <button
                                                type="button"
                                                className="pill"
                                                disabled={pendingCardId === card.id}
                                                onClick={() => removeCard(card.id)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </li>
                                ))}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
