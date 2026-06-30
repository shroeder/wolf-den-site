"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import VendorImportClient from "@/components/VendorImportClient";

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const DEFAULT_GAMES = [{ id: "", label: "All" }];

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatPrice(value) {
    return value === null || value === undefined ? "—" : priceFormatter.format(Number(value));
}

function AddListingForm({ onAdded }) {
    const [games, setGames] = useState(DEFAULT_GAMES);
    const [game, setGame] = useState("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(null);
    const [title, setTitle] = useState("");
    const [kind, setKind] = useState("sealed");
    const [condition, setCondition] = useState("NM");
    const [price, setPrice] = useState("");
    const [quantity, setQuantity] = useState("1");
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

    function pick(product) {
        setSelected(product);
        setTitle(product.name);
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
        if (price === "" || Number(price) < 0) {
            setError("Enter a valid price.");
            return;
        }

        setBusy(true);

        try {
            const response = await fetch("/api/marketplace/vendor/listings", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    kind,
                    condition: kind === "single" ? condition : null,
                    price: Number(price),
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

            // Reset.
            setSelected(null);
            setTitle("");
            setQuery("");
            setPrice("");
            setQuantity("1");
            setKind("sealed");
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

            <label htmlFor="add-search">Search products</label>
            <input
                id="add-search"
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                }}
                placeholder="e.g. Prismatic Evolutions, Charizard…"
                autoComplete="off"
            />

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
                            <label htmlFor="add-condition">Condition</label>
                            <select id="add-condition" className="lf-set-select" value={condition} onChange={(e) => setCondition(e.target.value)}>
                                {CONDITIONS.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </>
                    ) : null}

                    <div className="mkt-add-row">
                        <div>
                            <label htmlFor="add-price">Your price ($)</label>
                            <input id="add-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
                        </div>
                        <div>
                            <label htmlFor="add-qty">Quantity</label>
                            <input id="add-qty" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                        </div>
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
                                        <p className="mkt-card-meta">{r.setName}</p>
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
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const dirty = price !== String(listing.price ?? "") || quantity !== String(listing.quantity ?? 1);

    async function save() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/marketplace/vendor/listings/${listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ price: Number(price), quantity: Number(quantity) }),
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

    return (
        <li className="mkt-admin-row">
            <div className="mkt-admin-info">
                <strong>{listing.title}</strong>
                <span className="mkt-offer-meta">
                    {listing.kind}
                    {listing.condition ? ` · ${listing.condition}` : ""}
                    {listing.setName ? ` · ${listing.setName}` : ""}
                </span>
                {error ? <span className="muted">{error}</span> : null}
            </div>
            <div className="mkt-admin-actions mkt-listing-edit">
                <label>
                    $
                    <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
                <label>
                    Qty
                    <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </label>
                <button type="button" className="button primary" disabled={busy || !dirty} onClick={save}>
                    Save
                </button>
                <button type="button" className="pill" disabled={busy} onClick={remove}>
                    Delete
                </button>
            </div>
        </li>
    );
}

export default function VendorPortalClient({ vendor, listings }) {
    const router = useRouter();
    const refresh = () => router.refresh();

    async function logout() {
        await fetch("/api/marketplace/vendor/logout", { method: "POST" });
        router.refresh();
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <div className="mkt-admin-head">
                    <div>
                        <h1>Your Storefront</h1>
                        <p className="muted">{vendor.displayName}{vendor.locationLabel ? ` · ${vendor.locationLabel}` : ""}</p>
                    </div>
                    <button type="button" className="pill" onClick={logout}>
                        Sign out
                    </button>
                </div>
            </section>

            <section className="card">
                <h2>Add a listing</h2>
                <AddListingForm onAdded={refresh} />
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
