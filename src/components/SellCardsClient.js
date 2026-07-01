"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const DESTINATIONS = [
    { id: "sell", label: "Sell to us", blurb: "The Wolf Den makes you a cash or store-credit offer." },
    { id: "consign", label: "Consign with us", blurb: "We list and sell it for you and split the proceeds." },
    { id: "vendors", label: "Get vendor offers", blurb: "Local vetted vendors reach out with offers — like a virtual card show." },
];

function formatPrice(v) {
    return v == null ? null : priceFmt.format(Number(v));
}

export default function SellCardsClient({ defaultDestination = "sell", lockDestination = false }) {
    const [destination, setDestination] = useState(defaultDestination);
    const [cards, setCards] = useState([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [notes, setNotes] = useState("");
    const [askingPrice, setAskingPrice] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const abortRef = useRef(null);

    useEffect(() => {
        const trimmed = query.trim();
        const handle = setTimeout(async () => {
            if (trimmed.length < 2) {
                setResults([]);
                return;
            }
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const response = await fetch(`/api/marketplace/catalog-search?q=${encodeURIComponent(trimmed)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => null);
                if (response.ok) setResults(Array.isArray(data?.results) ? data.results : []);
            } catch {
                /* ignore (aborted or network) */
            }
        }, 250);
        return () => clearTimeout(handle);
    }, [query]);

    function addCard(product) {
        setCards((prev) =>
            prev.some((c) => c.catalogProductId === product.catalogProductId) ? prev : [...prev, product]
        );
        setQuery("");
        setResults([]);
    }

    function removeCard(id) {
        setCards((prev) => prev.filter((c) => c.catalogProductId !== id));
    }

    if (sent) {
        return (
            <p className="statement-copy">
                {destination === "vendors"
                    ? "You're posted! Local vendors can now see your cards and will email you with offers."
                    : "Thanks! We got your request and will email you back shortly."}
            </p>
        );
    }

    async function submit(event) {
        event.preventDefault();
        setError("");

        if (cards.length === 0 && !notes.trim()) {
            setError("Add at least one card, or describe what you have.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch("/api/sell", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    destination,
                    cards,
                    notes,
                    askingPrice: destination === "vendors" ? askingPrice : null,
                    name,
                    email,
                    phone,
                }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Could not send your request.");
            }
            setSent(true);
        } catch (err) {
            setError(err?.message || "Could not send your request.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form className="contact-form sell-form" onSubmit={submit}>
            {!lockDestination ? (
                <>
                    <span className="sell-step-label">1. What do you want to do?</span>
                    <div className="sell-dest-grid">
                        {DESTINATIONS.map((d) => (
                            <button
                                key={d.id}
                                type="button"
                                className={`sell-dest${destination === d.id ? " sell-dest-active" : ""}`}
                                onClick={() => setDestination(d.id)}
                            >
                                <strong>{d.label}</strong>
                                <span>{d.blurb}</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : null}

            <span className="sell-step-label">{lockDestination ? "" : "2. "}Add your cards</span>
            <label htmlFor="sell-search">Search the catalog</label>
            <input
                id="sell-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Charizard Obsidian 125"
                autoComplete="off"
            />

            {results.length > 0 ? (
                <div className="mkt-pick-grid sell-pick-grid">
                    {results.map((r) => (
                        <button key={r.catalogProductId} type="button" className="mkt-card mkt-pick-card" onClick={() => addCard(r)}>
                            <div className="mkt-card-art">
                                {r.imageUrl ? (
                                    <Image src={r.imageUrl} alt="" width={110} height={154} className="mkt-card-image" />
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
                            </div>
                        </button>
                    ))}
                </div>
            ) : null}

            {cards.length > 0 ? (
                <ul className="sell-selected">
                    {cards.map((c) => (
                        <li key={c.catalogProductId} className="sell-selected-item">
                            {c.imageUrl ? (
                                <Image src={c.imageUrl} alt="" width={40} height={56} className="sell-selected-thumb" />
                            ) : (
                                <span className="sell-selected-thumb sell-selected-thumb-empty" aria-hidden="true" />
                            )}
                            <span className="sell-selected-info">
                                <strong>{c.name}</strong>
                                <span className="muted">
                                    {c.setName}
                                    {c.number ? ` · #${c.number}` : ""}
                                    {c.marketPrice != null ? ` · mkt ${formatPrice(c.marketPrice)}` : ""}
                                </span>
                            </span>
                            <button type="button" className="pill" onClick={() => removeCard(c.catalogProductId)}>
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <label htmlFor="sell-notes">Anything not in the catalog? (sealed, collections, details)</label>
            <textarea
                id="sell-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional — describe anything the search didn't cover"
            />

            {destination === "vendors" ? (
                <>
                    <label htmlFor="sell-asking">Asking price (optional)</label>
                    <input
                        id="sell-asking"
                        type="text"
                        value={askingPrice}
                        onChange={(e) => setAskingPrice(e.target.value)}
                        placeholder="A number, or leave blank / 'open to offers'"
                    />
                </>
            ) : null}

            <span className="sell-step-label">{lockDestination ? "" : "3. "}Your contact</span>
            <label htmlFor="sell-name">Your name</label>
            <input id="sell-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />

            <label htmlFor="sell-email">Email</label>
            <input
                id="sell-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
            />

            <label htmlFor="sell-phone">Phone</label>
            <input id="sell-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />

            <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Sending..." : destination === "vendors" ? "Get offers from vendors" : "Send request"}
            </button>
            {error ? <p className="muted">{error}</p> : null}
        </form>
    );
}
