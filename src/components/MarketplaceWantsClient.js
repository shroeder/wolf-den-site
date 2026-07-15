"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function formatPrice(v) {
    return v != null ? `$${Number(v).toFixed(2)}` : null;
}

function ResultCard({ r, onAdd, busy }) {
    const [max, setMax] = useState("");
    return (
        <li className="mkt-card mkt-pick-card">
            <div className="mkt-card-art">
                {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="mkt-card-image" loading="lazy" />
                ) : (
                    <div className="mkt-card-image mkt-card-image-empty" aria-hidden="true" />
                )}
            </div>
            <div className="mkt-card-body">
                <h3 className="mkt-card-name">{r.name}</h3>
                <p className="mkt-card-meta">
                    {r.setName}
                    {r.number ? ` · #${r.number}` : ""}
                </p>
                {r.marketPrice != null ? <p className="mkt-card-price">mkt {formatPrice(r.marketPrice)}</p> : null}
                <div className="mkt-want-add">
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="under $ (opt)"
                        value={max}
                        onChange={(e) => setMax(e.target.value)}
                    />
                    <button type="button" className="pill" disabled={busy} onClick={() => onAdd(r, max)}>
                        + Add
                    </button>
                </div>
            </div>
        </li>
    );
}

export default function MarketplaceWantsClient() {
    const [wants, setWants] = useState(null); // null = not loaded yet
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [account, setAccount] = useState(null); // signed-in buyer
    const [authChecked, setAuthChecked] = useState(false);

    async function loadWants() {
        try {
            const res = await fetch("/api/marketplace/wants", { cache: "no-store" });
            const data = await res.json().catch(() => null);
            setWants(res.ok ? data?.wants || [] : []);
        } catch {
            setWants([]);
        }
    }

    // Account required: resolve the signed-in buyer and load their list. Signed-out visitors get a
    // "create a free account" prompt instead of an email box.
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const res = await fetch("/api/marketplace/auth/me", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    const mail = data?.buyer?.email || data?.account?.email || data?.vendor?.email || "";
                    if (!ignore && mail) {
                        setAccount({ email: mail });
                        loadWants();
                    }
                }
            } catch {
                /* signed out */
            } finally {
                if (!ignore) setAuthChecked(true);
            }
        })();
        return () => {
            ignore = true;
        };
    }, []);

    // Debounced catalog search.
    useEffect(() => {
        const q = query.trim();
        const handle = setTimeout(async () => {
            if (q.length < 2) {
                setResults([]);
                return;
            }
            try {
                const res = await fetch(`/api/marketplace/catalog-search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
                const data = await res.json().catch(() => null);
                if (res.ok) setResults(Array.isArray(data?.results) ? data.results : []);
            } catch {
                /* ignore */
            }
        }, q.length < 2 ? 0 : 250);
        return () => clearTimeout(handle);
    }, [query]);

    async function add(r, max) {
        if (!account) {
            setMsg("Create a free account to save cards to your want list.");
            return;
        }
        setBusy(true);
        setMsg("");
        try {
            const res = await fetch("/api/marketplace/want", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ catalogProductId: r.catalogProductId, maxPrice: max || null }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Could not add that.");
            setMsg(`Added ${r.name} to your want list.`);
            await loadWants();
        } catch (e) {
            setMsg(e?.message || "Could not add that.");
        } finally {
            setBusy(false);
        }
    }

    async function remove(id) {
        try {
            await fetch("/api/marketplace/wants", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id }),
            });
            await loadWants();
        } catch {
            /* ignore */
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Your Want List</h1>
                <p>
                    Instead of hunting, tell the marketplace what you&apos;re after. Vendors see the demand, and the
                    moment one lists a card on your list (at or under your price), you get an email.
                </p>
                {account ? (
                    <p className="muted">
                        Signed in as <strong>{account.email}</strong> — your want list is loaded below.
                    </p>
                ) : authChecked ? (
                    <p className="muted">
                        Your want list lives on your free Wolf Den account — so it syncs with the app, feeds your
                        rewards, and we can alert you the moment a card lands.
                    </p>
                ) : null}
                <p className="mkt-hero-links">
                    {!account && authChecked ? (
                        <Link href="/marketplace/login?signup=1" className="btn-gold">
                            Create your free account →
                        </Link>
                    ) : null}
                    <Link href="/marketplace" className="pill">
                        Search inventory instead
                    </Link>
                </p>
            </section>

            <section className="card">
                <h2>Add cards</h2>
                <label htmlFor="wl-search">Search the catalog</label>
                <input
                    id="wl-search"
                    type="text"
                    className="shop-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Charizard, Surging Sparks ETB"
                />
                {msg ? <p className="muted">{msg}</p> : null}
                {results.length > 0 ? (
                    <ul className="mkt-pick-grid">
                        {results.map((r) => (
                            <ResultCard key={r.catalogProductId} r={r} onAdd={add} busy={busy} />
                        ))}
                    </ul>
                ) : query.trim().length >= 2 ? (
                    <p className="muted">No matches — try a different spelling.</p>
                ) : null}
            </section>

            <section className="card">
                <h2>My want list{Array.isArray(wants) ? ` (${wants.length})` : ""}</h2>
                {wants === null ? (
                    <p className="muted">
                        {account ? "Loading your list…" : "Sign in or create a free account above to build your want list."}
                    </p>
                ) : wants.length === 0 ? (
                    <p className="muted">Nothing yet. Search above and add the cards you&apos;re looking for.</p>
                ) : (
                    <ul className="mkt-admin-list">
                        {wants.map((w) => (
                            <li key={w.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{w.name}</strong>
                                    <span className="mkt-offer-meta">
                                        {w.setName}
                                        {w.number ? ` · #${w.number}` : ""}
                                        {w.maxPrice != null ? ` · under ${formatPrice(w.maxPrice)}` : ""}
                                        {w.notified ? " · a vendor listed it!" : ""}
                                    </span>
                                </div>
                                <button type="button" className="pill" onClick={() => remove(w.id)}>
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
