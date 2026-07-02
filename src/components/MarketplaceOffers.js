"use client";

import Link from "next/link";
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

// Graded -> "PSA 10"; raw single -> condition label; sealed -> null.
function qualityLabel(offer) {
    if (offer.graded) {
        return [offer.gradingCompany, offer.grade].filter(Boolean).join(" ") || "Graded";
    }
    return offer.condition ? CONDITION_LABELS[offer.condition] || offer.condition : null;
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
    const conditionLabel = qualityLabel(offer);

    return (
        <li className="mkt-offer">
            <div className="mkt-offer-row">
                <div className="mkt-offer-main">
                    <span className="mkt-offer-price">{formatPrice(offer.price)}</span>
                    <span className="mkt-offer-meta mkt-offer-vendor-line">
                        {offer.vendor.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={offer.vendor.logoUrl} alt="" className="mkt-vendor-logo mkt-vendor-logo-sm" />
                        ) : null}
                        <Link href={`/marketplace/vendor/${offer.vendor.id}`} className="mkt-offer-vendor">
                            ✓ {offer.vendor.displayName}
                        </Link>
                        {offer.vendor.locationLabel ? ` · ${offer.vendor.locationLabel}` : ""}
                    </span>
                    <span className="mkt-offer-meta">
                        {offer.language && offer.language !== "English" ? (
                            <span className="mkt-lang-badge">{offer.language}</span>
                        ) : null}
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

function NotifyMe({ catalogProductId, productName }) {
    const [email, setEmail] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    if (done) {
        return (
            <p className="statement-copy">
                Done — we&apos;ll email you the moment an approved vendor lists {productName}
                {maxPrice ? ` at or under $${Number(maxPrice).toFixed(2)}` : ""}.
            </p>
        );
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/marketplace/want", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ catalogProductId, email, maxPrice: maxPrice || null }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Could not save that.");
            }
            setDone(true);
        } catch (err) {
            setError(err?.message || "Could not save that.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="mkt-notify">
            <p className="muted">No vendor has this in stock yet.</p>
            <form className="contact-form" onSubmit={submit}>
                <label htmlFor="mkt-notify-email">Notify me when a vendor lists it</label>
                <input
                    id="mkt-notify-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                />
                <label htmlFor="mkt-notify-price">Only if it&apos;s under (optional)</label>
                <input
                    id="mkt-notify-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="e.g. 90"
                />
                <button className="button primary" type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Notify me"}
                </button>
                {error ? <p className="muted">{error}</p> : null}
            </form>
        </div>
    );
}

export default function MarketplaceOffers({ offers, productName, catalogProductId }) {
    if (!offers || offers.length === 0) {
        return <NotifyMe catalogProductId={catalogProductId} productName={productName} />;
    }

    return (
        <ul className="mkt-offer-list">
            {offers.map((offer) => (
                <OfferRow key={offer.listingId} offer={offer} productName={productName} />
            ))}
        </ul>
    );
}
