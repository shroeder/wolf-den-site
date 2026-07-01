"use client";

import { useState } from "react";

export default function SellOfferForm() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [items, setItems] = useState("");
    const [askingPrice, setAskingPrice] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    if (sent) {
        return (
            <p className="statement-copy">
                You&apos;re posted! Local vendors can now see what you&apos;re selling and will email you directly with
                offers. Keep an eye on your inbox.
            </p>
        );
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/sell-offer", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, email, phone, items, askingPrice }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Could not post your request.");
            }
            setSent(true);
        } catch (err) {
            setError(err?.message || "Could not post your request.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form className="contact-form" onSubmit={submit}>
            <label htmlFor="offer-items">What are you selling?</label>
            <textarea
                id="offer-items"
                value={items}
                onChange={(e) => setItems(e.target.value)}
                rows={4}
                placeholder="e.g. Charizard VMAX Alt Art (near mint), Umbreon VMAX, a few graded slabs..."
                required
            />

            <label htmlFor="offer-price">Asking price (optional)</label>
            <input
                id="offer-price"
                type="text"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="A number, or leave blank / 'open to offers'"
            />

            <label htmlFor="offer-name">Your name</label>
            <input id="offer-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />

            <label htmlFor="offer-email">Email</label>
            <input
                id="offer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
            />

            <label htmlFor="offer-phone">Phone</label>
            <input id="offer-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />

            <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Posting..." : "Get offers from vendors"}
            </button>
            {error ? <p className="muted">{error}</p> : null}
        </form>
    );
}
