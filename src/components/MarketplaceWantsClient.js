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
    const [email, setEmail] = useState("");
    const [wants, setWants] = useState(null); // null = not loaded yet
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function loadWants(mail = email) {
        if (!mail) return;
        try {
            const res = await fetch(`/api/marketplace/wants?email=${encodeURIComponent(mail)}`, { cache: "no-store" });
            const data = await res.json().catch(() => null);
            setWants(res.ok ? data?.wants || [] : []);
        } catch {
            setWants([]);
        }
    }

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
        if (!email) {
            setMsg("Enter your email up top first.");
            return;
        }
        setBusy(true);
        setMsg("");
        try {
            const res = await fetch("/api/marketplace/want", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ catalogProductId: r.catalogProductId, email, maxPrice: max || null }),
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
                body: JSON.stringify({ id, email }),
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
                <div className="contact-form" style={{ maxWidth: "420px" }}>
                    <label htmlFor="wl-email">Your email</label>
                    <input
                        id="wl-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => loadWants()}
                        placeholder="you@example.com"
                    />
                    <button type="button" className="button primary" onClick={() => loadWants()} disabled={!email}>
                        Load my list
                    </button>
                </div>
                <p className="mkt-hero-links">
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
                    <p className="muted">Enter your email above to load your list.</p>
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
