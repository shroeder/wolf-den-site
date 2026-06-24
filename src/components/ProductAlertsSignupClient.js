"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ProductAlertsSignupClient() {
    const [categories, setCategories] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [done, setDone] = useState(false);

    const searchParams = useSearchParams();
    const banner = useMemo(() => {
        if (searchParams.get("confirmed") === "1") {
            return "Your email is confirmed — new-arrival alerts are on.";
        }

        if (searchParams.get("confirmed") === "invalid") {
            return "That confirmation link is invalid or expired. Sign up again to retry.";
        }

        if (searchParams.get("unsubscribed") === "1") {
            return "You've been unsubscribed. You won't get any more new-arrival alerts.";
        }

        if (searchParams.get("unsubscribed") === "invalid") {
            return "That unsubscribe link is invalid — you may already be unsubscribed.";
        }

        return "";
    }, [searchParams]);

    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/product-alerts/categories", { cache: "no-store" });
                const data = await response.json().catch(() => null);

                if (!ignore && response.ok && Array.isArray(data?.categories)) {
                    setCategories(data.categories);
                }
            } catch {
                // Non-fatal: the form simply shows no categories.
            }
        })();

        return () => {
            ignore = true;
        };
    }, []);

    function toggleCategory(id) {
        setSelected((prev) => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    async function onSubmit(event) {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");

        try {
            const response = await fetch("/api/product-alerts/subscribe", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, categoryIds: Array.from(selected) }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not sign you up.");
            }

            setDone(true);
            setMessage(data.message || "Check your inbox to confirm.");
        } catch (error) {
            setMessage(error?.message || "Could not sign you up.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>New-Arrival Alerts</h1>
                <p>
                    Pick the categories you care about and we&apos;ll email you when new stock lands in the shop —
                    including restocks of items that sold out. One quick confirmation and you&apos;re set.
                </p>
                {banner ? <p className="statement-copy">{banner}</p> : null}
            </section>

            <section className="card">
                {done ? (
                    <p className="statement-copy">{message}</p>
                ) : (
                    <form className="contact-form" onSubmit={onSubmit}>
                        <fieldset className="pa-categories">
                            <legend>Which categories should we alert you about?</legend>
                            {categories.length === 0 ? (
                                <p className="muted">Loading categories…</p>
                            ) : (
                                <div className="pa-category-grid">
                                    {categories.map((category) => (
                                        <label key={category.id} className="pa-category-option">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(category.id)}
                                                onChange={() => toggleCategory(category.id)}
                                            />
                                            <span>{category.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </fieldset>

                        <label htmlFor="pa-email">Email</label>
                        <input
                            id="pa-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.com"
                            required
                        />

                        <button
                            className="button primary"
                            type="submit"
                            disabled={submitting || selected.size === 0}
                        >
                            {submitting ? "Signing up…" : "Sign up for alerts"}
                        </button>

                        {selected.size === 0 ? (
                            <p className="muted">Pick at least one category to continue.</p>
                        ) : null}
                        {message ? <p className="statement-copy">{message}</p> : null}
                    </form>
                )}
            </section>

            <section className="card">
                <p className="muted">
                    Changed your mind? Every alert email has a one-click unsubscribe link. You can re-subscribe here
                    anytime to update the categories you follow.
                </p>
            </section>
        </div>
    );
}
