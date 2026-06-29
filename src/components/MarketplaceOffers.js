"use client";

import { useState } from "react";

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const CONDITION_LABELS = {
    NM: "Near Mint",
    LP: "Lightly Played",
    MP: "Moderately Played",
    HP: "Heavily Played",
    DMG: "Damaged",
};

function formatPrice(value) {
    return value === null || value === undefined ? "—" : priceFormatter.format(Number(value));
}

function ContactForm({ offer, productName, onDone }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState(`Hi, is your ${productName} still available?`);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    if (sent) {
        return (
            <p className="statement-copy">
                Sent! {offer.vendor.displayName} will get your message and can reply straight to your email.
            </p>
        );
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/marketplace/contact", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    listingId: offer.listingId,
                    buyerName: name,
                    buyerEmail: email,
                    message,
                }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not send your message.");
            }

            setSent(true);
            if (onDone) onDone();
        } catch (err) {
            setError(err?.message || "Could not send your message.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form className="contact-form mkt-contact-form" onSubmit={submit}>
            <label htmlFor={`mkt-name-${offer.listingId}`}>Your name</label>
            <input
                id={`mkt-name-${offer.listingId}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
            />
            <label htmlFor={`mkt-email-${offer.listingId}`}>Your email</label>
            <input
                id={`mkt-email-${offer.listingId}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
            />
            <label htmlFor={`mkt-msg-${offer.listingId}`}>Message</label>
            <textarea
                id={`mkt-msg-${offer.listingId}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
            />
            <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Sending..." : `Send to ${offer.vendor.displayName}`}
            </button>
            {error ? <p className="muted">{error}</p> : null}
        </form>
    );
}

function OfferRow({ offer, productName }) {
    const [open, setOpen] = useState(false);
    const conditionLabel = offer.condition ? CONDITION_LABELS[offer.condition] || offer.condition : null;

    return (
        <li className="mkt-offer">
            <div className="mkt-offer-row">
                <div className="mkt-offer-main">
                    <span className="mkt-offer-price">{formatPrice(offer.price)}</span>
                    <span className="mkt-offer-meta">
                        {offer.vendor.displayName}
                        {offer.vendor.locationLabel ? ` · ${offer.vendor.locationLabel}` : ""}
                    </span>
                    <span className="mkt-offer-meta">
                        {conditionLabel ? `${conditionLabel} · ` : ""}
                        {offer.quantity} available
                    </span>
                </div>
                <button type="button" className="button primary" onClick={() => setOpen((v) => !v)}>
                    {open ? "Cancel" : "Contact"}
                </button>
            </div>
            {open ? <ContactForm offer={offer} productName={productName} /> : null}
        </li>
    );
}

export default function MarketplaceOffers({ offers, productName }) {
    if (!offers || offers.length === 0) {
        return <p className="muted">No vendor currently has this in stock.</p>;
    }

    return (
        <ul className="mkt-offer-list">
            {offers.map((offer) => (
                <OfferRow key={offer.listingId} offer={offer} productName={productName} />
            ))}
        </ul>
    );
}
