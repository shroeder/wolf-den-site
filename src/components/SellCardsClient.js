"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const DESTINATIONS = [
    { id: "sell", label: "Sell to us", blurb: "Cash or store-credit offer from The Wolf Den." },
    { id: "consign", label: "Consign with us", blurb: "We list & sell it for you, then split the proceeds." },
];

function formatPrice(v) {
    return v == null ? null : priceFmt.format(Number(v));
}

// Turn the picked cards + notes into a friendly opening message to the shop.
function buildMessage(destination, cards, notes) {
    const lines = [destination === "consign" ? "Hi! I'd like to consign these with you:" : "Hi! I'd like to sell these to you:"];
    for (const c of cards) {
        const meta = [c.setName, c.number ? `#${c.number}` : null, c.marketPrice != null ? `mkt ${formatPrice(c.marketPrice)}` : null].filter(Boolean).join(" · ");
        lines.push(`• ${c.name}${meta ? ` (${meta})` : ""}`);
    }
    if (notes.trim()) lines.push("", notes.trim());
    return lines.join("\n");
}

export default function SellCardsClient({ defaultDestination = "sell" }) {
    const router = useRouter();
    const [destination, setDestination] = useState(defaultDestination === "consign" ? "consign" : "sell");
    const [cards, setCards] = useState([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [notes, setNotes] = useState("");
    const [authed, setAuthed] = useState(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef(null);

    useEffect(() => {
        let ignore = false;
        (async () => {
            const res = await fetch("/api/marketplace/auth/me", { cache: "no-store" }).catch(() => null);
            const d = res && res.ok ? await res.json().catch(() => null) : null;
            if (!ignore) setAuthed(Boolean(d?.buyer || d?.account));
        })();
        return () => { ignore = true; };
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        const handle = setTimeout(async () => {
            if (trimmed.length < 2) { setResults([]); return; }
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const response = await fetch(`/api/marketplace/catalog-search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal });
                const data = await response.json().catch(() => null);
                if (response.ok) setResults(Array.isArray(data?.results) ? data.results : []);
            } catch {
                /* ignore */
            }
        }, 250);
        return () => clearTimeout(handle);
    }, [query]);

    function addCard(product) {
        setCards((prev) => (prev.some((c) => c.catalogProductId === product.catalogProductId) ? prev : [...prev, product]));
        setQuery("");
        setResults([]);
    }
    function removeCard(id) {
        setCards((prev) => prev.filter((c) => c.catalogProductId !== id));
    }

    async function submit(event) {
        event.preventDefault();
        setError("");
        if (cards.length === 0 && !notes.trim()) {
            setError("Add a card or two, or describe what you have.");
            return;
        }
        if (!authed) {
            window.location.href = `/marketplace/login?returnTo=${encodeURIComponent("/sell-cards")}`;
            return;
        }
        setSending(true);
        try {
            const message = buildMessage(destination, cards, notes);
            const r = await fetch("/api/marketplace/sell/message", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "store_unavailable" ? "Messaging is briefly unavailable — please call the store." : d?.error || "Could not send.");
            router.push(d.href || "/marketplace/inbox");
        } catch (err) {
            setError(err?.message || "Could not send.");
            setSending(false);
        }
    }

    return (
        <form className="contact-form sell-form" onSubmit={submit}>
            <span className="sell-step-label">1. What do you want to do?</span>
            <div className="sell-dest-grid">
                {DESTINATIONS.map((d) => (
                    <button key={d.id} type="button" className={`sell-dest${destination === d.id ? " sell-dest-active" : ""}`} onClick={() => setDestination(d.id)}>
                        <strong>{d.label}</strong>
                        <span>{d.blurb}</span>
                    </button>
                ))}
            </div>

            <span className="sell-step-label">2. Add your cards <span className="muted">(optional — or just describe them)</span></span>
            <label htmlFor="sell-search">Search the catalog</label>
            <input id="sell-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Charizard Obsidian 125" autoComplete="off" />

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
                                <p className="mkt-card-meta">{r.setName}{r.number ? ` · #${r.number}` : ""}</p>
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
                                <span className="muted">{c.setName}{c.number ? ` · #${c.number}` : ""}{c.marketPrice != null ? ` · mkt ${formatPrice(c.marketPrice)}` : ""}</span>
                            </span>
                            <button type="button" className="pill" onClick={() => removeCard(c.catalogProductId)}>Remove</button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <label htmlFor="sell-notes">Anything else? (sealed, collections, condition, cash vs. credit)</label>
            <textarea id="sell-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional — tell us anything the search didn't cover" />

            <div className="sell-send-row">
                <button className="button primary" type="submit" disabled={sending}>
                    {sending ? "Sending…" : authed === false ? "Log in to send →" : "Send to The Wolf Den →"}
                </button>
                <span className="muted sell-send-note">
                    {authed === false
                        ? "You'll log in, then it sends as a direct message to the shop."
                        : "Opens a direct conversation with the shop — we reply personally with an offer. 🐺"}
                </span>
            </div>
            {error ? <p className="muted">{error}</p> : null}
        </form>
    );
}
