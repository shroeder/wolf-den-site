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
        setQuery(product.name);
        setResults([]);
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

            <label htmlFor="add-search">Find the product</label>
            <input
                id="add-search"
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                }}
                placeholder="Search the TCG catalog…"
                autoComplete="off"
            />
            {results.length > 0 ? (
                <ul className="mkt-picker">
                    {results.map((r) => (
                        <li key={r.catalogProductId}>
                            <button type="button" className="mkt-picker-item" onClick={() => pick(r)}>
                                {r.imageUrl ? (
                                    <Image src={r.imageUrl} alt="" width={64} height={90} className="mkt-picker-thumb" />
                                ) : (
                                    <span className="mkt-picker-thumb mkt-picker-thumb-empty" aria-hidden="true" />
                                )}
                                <span className="mkt-picker-text">
                                    <span className="mkt-picker-name">{r.name}</span>
                                    <span className="mkt-picker-meta">
                                        {r.setName}
                                        {r.marketPrice != null ? ` · mkt ${formatPrice(r.marketPrice)}` : ""}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

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
                <h2>Bulk import from CSV</h2>
                <VendorImportClient onImported={refresh} />
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
