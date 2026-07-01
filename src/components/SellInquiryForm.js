"use client";

import { useState } from "react";

export default function SellInquiryForm() {
    const [kind, setKind] = useState("sell");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [items, setItems] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    if (sent) {
        return (
            <p className="statement-copy">
                Thanks! We got your {kind === "consign" ? "consignment" : "sell"} request and will email you back shortly.
            </p>
        );
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/sell-inquiry", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind, name, email, phone, items, message }),
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
        <form className="contact-form" onSubmit={submit}>
            <div className="mkt-toggle-row" role="group" aria-label="Sell or consign">
                <button type="button" className={`pill${kind === "sell" ? " lf-game-active" : ""}`} onClick={() => setKind("sell")}>
                    Sell to us
                </button>
                <button type="button" className={`pill${kind === "consign" ? " lf-game-active" : ""}`} onClick={() => setKind("consign")}>
                    Consign
                </button>
            </div>

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

            <label htmlFor="sell-items">What do you have?</label>
            <textarea
                id="sell-items"
                value={items}
                onChange={(e) => setItems(e.target.value)}
                rows={4}
                placeholder="e.g. Charizard VMAX, a Commander deck, a small Pokemon collection..."
                required
            />

            <label htmlFor="sell-message">Anything else? (condition, quantities, price hopes)</label>
            <textarea
                id="sell-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Optional"
            />

            <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send request"}
            </button>
            {error ? <p className="muted">{error}</p> : null}
        </form>
    );
}
